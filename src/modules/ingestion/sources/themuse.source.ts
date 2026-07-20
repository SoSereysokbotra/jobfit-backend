// src/modules/ingestion/sources/themuse.source.ts
//
// TheMuse public jobs API adapter. Fetches pages of postings and normalizes them
// to NormalizedJob. The API key is optional (TheMuse serves unauthenticated but
// rate-limited); read it from THEMUSE_API_KEY when present — never hard-code it.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NormalizedJob } from '../ingestion.types';

const THEMUSE_URL = 'https://www.themuse.com/api/public/jobs';
const FETCH_TIMEOUT_MS = 15_000;

/** The subset of TheMuse's response we rely on. */
interface TheMuseJob {
  id: number;
  name?: string;
  contents?: string;
  company?: { name?: string };
  locations?: { name?: string }[];
  refs?: { landing_page?: string };
}
interface TheMuseResponse {
  page: number;
  results: TheMuseJob[];
}

@Injectable()
export class TheMuseSource {
  private readonly logger = new Logger(TheMuseSource.name);

  constructor(private readonly config: ConfigService) {}

  /** Fetch + normalize `pages` pages (1-indexed) from TheMuse. */
  async fetch(pages: number): Promise<NormalizedJob[]> {
    const apiKey = this.config.get<string>('THEMUSE_API_KEY');
    const jobs: NormalizedJob[] = [];

    for (let page = 1; page <= pages; page++) {
      const raw = await this.fetchPage(page, apiKey);
      for (const job of raw) {
        const normalized = this.normalize(job);
        if (normalized) jobs.push(normalized);
      }
    }
    return jobs;
  }

  private async fetchPage(
    page: number,
    apiKey?: string,
  ): Promise<TheMuseJob[]> {
    const url = new URL(THEMUSE_URL);
    url.searchParams.set('page', String(page));
    if (apiKey) url.searchParams.set('api_key', apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`TheMuse responded ${res.status} for page ${page}`);
      }
      const body = (await res.json()) as TheMuseResponse;
      return body.results ?? [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Map one TheMuse job to NormalizedJob; returns null if it fails data-quality. */
  private normalize(job: TheMuseJob): NormalizedJob | null {
    const title = job.name?.trim();
    const companyName = job.company?.name?.trim();
    // Required fields per FR-JOBS-001: title + company.
    if (!title || !companyName || !job.id) return null;

    const location = job.locations?.[0]?.name?.trim() || null;
    const remote =
      job.locations?.some((l) => /remote|flexible/i.test(l.name ?? '')) ?? false;

    return {
      source: 'THEMUSE',
      externalId: String(job.id),
      title,
      companyName,
      description: this.stripHtml(job.contents ?? ''),
      location,
      remoteType: remote ? 'REMOTE' : 'ON_SITE',
      externalUrl: job.refs?.landing_page?.trim() || null,
    };
  }

  /** TheMuse `contents` is HTML; flatten it to readable plain text. */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
