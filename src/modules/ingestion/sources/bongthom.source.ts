// src/modules/ingestion/sources/bongthom.source.ts
//
// BongThom.com adapter — Cambodia's main job board.
//
// FEED ONLY, DELIBERATELY. bongthom advertises
//   <link rel="alternate" type="application/rss+xml" title="Job Listings" href="/rss.xml">
// in its page head, and that feed carries title, employer, id, link and date for every
// current posting (275 at time of writing). We take exactly that and nothing else.
//
// WHY WE DO NOT READ THE DETAIL PAGES. The site draws a line in its own markup, twice:
//
//   1. The RSS feed OMITS the job description. It syndicates the listing, not the body.
//   2. On the detail page the description is interleaved with <span class="noselect">,
//      and their stylesheet defines `.noselect { user-select: none }` — so a human
//      highlighting the text gets a broken copy. That is an anti-copying measure, not
//      styling.
//
// Both point the same way: syndicate the listing, do not take the body. The text is in
// the HTML and nothing technically stops us, but "we could" is not "we may", and there is
// no need to read a Terms of Use to see what the publisher is saying here.
//
// THE COST IS REAL AND ACCEPTED. Without a description these postings embed poorly and
// will not rank well in matching. They exist to be listed and clicked through to the
// source — which is also the arrangement the publisher is offering.
//
// jobnet.com.kh is the opposite case and IS read in full: it publishes the entire
// description as schema.org JSON-LD, which exists to be machine-read. See
// docs/INGESTION_KH_PLAN.md.

import { Injectable, Logger } from '@nestjs/common';
import { JobBoardSource, JobSource, NormalizedJob } from '../ingestion.types';
import { decodeEntities, politeFetchText } from './polite-fetch';

const RSS_URL = 'https://www.bongthom.com/rss.xml';

/** One posting as the feed states it. The feed has no more than this. */
export interface BongThomFeedItem {
  externalId: string;
  title: string;
  companyName: string;
  link: string;
}

@Injectable()
export class BongThomSource implements JobBoardSource {
  private readonly logger = new Logger(BongThomSource.name);
  readonly source: JobSource = 'BONGTHOM';

  /** One request per run: the whole feed, capped at `limit`. */
  async fetchJobs(limit: number): Promise<NormalizedJob[]> {
    const items = parseFeed(await politeFetchText(RSS_URL)).slice(0, limit);
    this.logger.log(`BongThom feed: ${items.length} item(s) after limit ${limit}`);
    return items.map((item) => toJob(item));
  }
}

/**
 * A feed item as a NormalizedJob.
 *
 * `description` is the TITLE, because the feed carries no description and we do not fetch
 * the page that would. `Job.description` is non-nullable, so the honest minimum goes in
 * rather than an invented summary or a marketing blurb.
 *
 * salary / employmentType are absent for the same reason — those live only on the detail
 * page. `persist` writes optional fields solely when present, so the columns stay NULL
 * instead of gaining a default nobody stated.
 */
function toJob(item: BongThomFeedItem): NormalizedJob {
  return {
    source: 'BONGTHOM',
    externalId: item.externalId,
    title: item.title,
    companyName: item.companyName,
    description: item.title,
    // The feed states no location, and Phnom Penh is a guess we are not entitled to make.
    location: null,
    // No remote flag is published; ON_SITE is the schema default and Cambodian postings
    // are overwhelmingly on-site. Not inventing a REMOTE we cannot see.
    remoteType: 'ON_SITE',
    externalUrl: item.link,
  };
}

// ── Parsing (exported for tests; no network, no Nest) ────────────────────────

/**
 * Items out of the RSS feed.
 *
 * Neither the employer nor the id is a field of its own: the employer is inside a CDATA
 * description as `<strong>Employer:</strong> Krawma &amp; Associates Co., Ltd.<br/>`, and
 * the id is inside a guid as `btdc-id: 41023`. Both are extracted by shape, and an item
 * missing either is DROPPED — a posting with no stable id cannot be deduplicated, so
 * storing it would create a duplicate on every run.
 */
export function parseFeed(xml: string): BongThomFeedItem[] {
  const items: BongThomFeedItem[] = [];
  for (const block of xml.split(/<item>/i).slice(1)) {
    const title = decodeEntities(tag(block, 'title') ?? '').trim();
    const link = (tag(block, 'link') ?? '').trim();
    const externalId = /btdc-id:\s*(\d+)/i.exec(tag(block, 'guid') ?? '')?.[1] ?? '';
    const employer = /<strong>\s*Employer:\s*<\/strong>\s*([^<]+)/i.exec(block)?.[1] ?? '';
    const companyName = decodeEntities(employer).trim();

    if (!title || !link || !externalId || !companyName) continue;
    items.push({ externalId, title, companyName, link });
  }
  return items;
}

/** First `<tag>…</tag>` body, CDATA unwrapped. */
function tag(block: string, name: string): string | null {
  const raw = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block)?.[1];
  if (raw === undefined) return null;
  return raw.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
}
