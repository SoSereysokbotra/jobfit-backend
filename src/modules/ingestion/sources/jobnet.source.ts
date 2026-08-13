// src/modules/ingestion/sources/jobnet.source.ts
//
// JobNet.com.kh adapter.
//
// READS THE PUBLISHER'S OWN STRUCTURED DATA. Every detail page carries a schema.org
// `JobPosting` JSON-LD block containing the full description — markup whose entire purpose
// is to be machine-read by search engines and aggregators. There are no anti-copy measures
// on the site (measured: zero `user-select:none`, no context-menu blocking), which is the
// opposite of bongthom, and why this source is read in full while that one is feed-only.
//
// PARSE THE JSON-LD, NEVER THE CSS. Structured data is authored to be consumed and
// survives a restyle; CSS selectors do not. Two quirks of THEIR implementation are handled
// explicitly below, both measured against the live site:
//
//   1. Keys are CAPITALISED — `Title` and `Description`, not schema.org's lowercase.
//      `data.title` is undefined.
//   2. The block contains UNESCAPED CONTROL CHARACTERS (raw newlines inside strings), so
//      a plain JSON.parse throws "Invalid control character".
//
// A posting whose JSON-LD is missing or unparseable is SKIPPED, never guessed at from the
// HTML: a job stored with a fabricated title is worse than a job not stored.
//
// See docs/INGESTION_KH_PLAN.md.

import { Injectable, Logger } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { JobBoardSource, JobSource, NormalizedJob } from '../ingestion.types';
import { htmlToText } from '../html-to-text';
import { politeFetchText } from './polite-fetch';

const LISTING_URL = 'https://www.jobnet.com.kh/jobs-in-cambodia';
const ORIGIN = 'https://www.jobnet.com.kh';

/** `Full Time` / `Part Time` / … as jobnet writes them, onto our enum. */
const EMPLOYMENT_TYPES: Record<string, $Enums.EmploymentType> = {
  'full time': 'FULL_TIME',
  'full-time': 'FULL_TIME',
  'part time': 'PART_TIME',
  'part-time': 'PART_TIME',
  contract: 'CONTRACT',
  temporary: 'TEMPORARY',
  internship: 'TEMPORARY',
  freelance: 'FREELANCE',
};

@Injectable()
export class JobNetSource implements JobBoardSource {
  private readonly logger = new Logger(JobNetSource.name);
  readonly source: JobSource = 'JOBNET';

  async fetchJobs(limit: number): Promise<NormalizedJob[]> {
    const links = parseListing(await politeFetchText(LISTING_URL)).slice(0, limit);
    this.logger.log(`JobNet listing: ${links.length} posting link(s)`);

    const jobs: NormalizedJob[] = [];
    for (const link of links) {
      try {
        const job = parseDetail(await politeFetchText(link.url), link);
        if (job) jobs.push(job);
        else this.logger.warn(`JobNet ${link.externalId}: no usable JobPosting JSON-LD`);
      } catch (err) {
        this.logger.warn(`JobNet ${link.externalId} failed: ${(err as Error).message}`);
      }
    }
    return jobs;
  }
}

export interface JobNetLink {
  externalId: string;
  url: string;
}

// ── Parsing (exported for tests; no network, no Nest) ────────────────────────

/**
 * Posting links off the listing page.
 *
 * Shape is `/job/{slug}/{id}`; the trailing id is the dedup key. Slugs contain Khmer
 * (`/job/មន្ត្រីឥណទាន-niron-microfinance-plc/6189`), so the pattern must not assume ASCII.
 * De-duplicated because the listing repeats each posting (measured: 117 links, 30 unique).
 */
export function parseListing(html: string): JobNetLink[] {
  const seen = new Set<string>();
  const links: JobNetLink[] = [];
  for (const m of html.matchAll(/href="(\/job\/[^"]+?\/(\d+))"/g)) {
    const [, path, externalId] = m;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    links.push({ externalId, url: `${ORIGIN}${path}` });
  }
  return links;
}

/**
 * A NormalizedJob from the page's JSON-LD, or null when there is nothing trustworthy.
 *
 * Returning null rather than a partial job is the point: the caller counts it as skipped,
 * and a run with a high skip rate is a signal that their markup changed — which is
 * information we lose entirely if we fall back to scraping the HTML.
 */
export function parseDetail(html: string, link: JobNetLink): NormalizedJob | null {
  const data = extractJobPosting(html);
  if (!data) return null;

  const title = str(pick(data, 'title'))?.trim();
  const companyName = str(
    pick(asRecord(pick(data, 'hiringOrganization')) ?? {}, 'name'),
  )?.trim();
  // Both are required by the data-quality guard downstream; bail here so the reason is
  // "no usable JSON-LD" rather than a silent skip deeper in the pipeline.
  if (!title || !companyName) return null;

  const descriptionHtml = str(pick(data, 'description')) ?? '';

  return {
    source: 'JOBNET',
    externalId: link.externalId,
    title,
    companyName,
    // The description is HTML; htmlToText keeps its paragraphs and bullets and emits
    // plain text, which matters doubly here because this is third-party input.
    description: htmlToText(descriptionHtml) || title,
    location: parseLocation(data),
    // jobnet publishes no remote flag. ON_SITE is the schema default; not inventing one.
    remoteType: 'ON_SITE',
    externalUrl: link.url,
    employmentType: parseEmploymentType(str(pick(data, 'employmentType'))),
  };
}

/**
 * The JobPosting block, tolerating malformed JSON.
 *
 * Control characters inside strings are stripped before parsing because jobnet emits raw
 * newlines there — valid-looking output that `JSON.parse` rejects outright. Stripping is
 * safe: the affected characters are whitespace inside prose, not structure.
 */
export function extractJobPosting(html: string): Record<string, unknown> | null {
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, raw] of blocks) {
    // Written as escapes, NEVER literal control characters: putting the real bytes in
    // the source makes the file binary to grep and unreviewable in a diff.
    // Replacing them with a space is safe in both positions - between JSON tokens
    // whitespace is insignificant, and inside a string a raw newline was always meant
    // to be a space in prose.
    // eslint-disable-next-line no-control-regex
    const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ');
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      continue;
    }
    // A page may carry several blocks (breadcrumbs, organisation); take the JobPosting.
    for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
      const rec = asRecord(node);
      if (rec && str(pick(rec, '@type'))?.toLowerCase() === 'jobposting') return rec;
    }
  }
  return null;
}

/** "Phnom Penh, Cambodia" from the nested PostalAddress, skipping absent parts. */
function parseLocation(data: Record<string, unknown>): string | null {
  const place = asRecord(pick(data, 'jobLocation'));
  const address = asRecord(pick(place ?? {}, 'address'));
  if (!address) return null;
  const parts = ['addressLocality', 'addressRegion', 'addressCountry']
    .map((k) => str(pick(address, k))?.trim())
    .filter((v): v is string => !!v);
  // Region often repeats locality ("Phnom Penh, Phnom Penh, Cambodia").
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(', ') : null;
}

function parseEmploymentType(raw: string | undefined): $Enums.EmploymentType | null {
  if (!raw) return null;
  return EMPLOYMENT_TYPES[raw.trim().toLowerCase()] ?? null;
}

/**
 * Case-insensitive key lookup.
 *
 * jobnet writes `Title` and `Description` where schema.org specifies lowercase, so a
 * direct property read silently returns undefined and every posting looks unusable.
 */
function pick(obj: Record<string, unknown>, key: string): unknown {
  const target = key.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
