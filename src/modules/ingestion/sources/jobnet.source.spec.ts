// JobNet parsing, against a REAL captured page (test/fixtures/ingestion).
//
// The fixture's JSON-LD block is UNMODIFIED, which matters: it carries both quirks of
// their implementation — capitalised `Title`/`Description` keys, and unescaped control
// characters that make `JSON.parse` throw. A hand-written fixture would have neither, and
// the parser would pass its tests while returning nothing against the live site.

import { readFileSync } from 'fs';
import { join } from 'path';
import { extractJobPosting, parseDetail, parseListing } from './jobnet.source';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '../../../../test/fixtures/ingestion', name), 'utf8');

const DETAIL = fixture('jobnet-detail.html');
const LISTING = fixture('jobnet-listing.html');
const LINK = { externalId: '6195', url: 'https://www.jobnet.com.kh/job/x/6195' };

describe('JobNet listing parsing', () => {
  it('finds posting links and de-duplicates them', () => {
    // The live page lists each posting more than once (117 links, 30 unique).
    const links = parseListing(LISTING);
    const ids = links.map((l) => l.externalId);

    expect(links.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps Khmer slugs intact', () => {
    // Real slugs look like /job/មន្ត្រីឥណទាន-niron-microfinance-plc/6189. A parser that
    // assumes ASCII silently drops a chunk of a Cambodian job board.
    const links = parseListing(LISTING);
    expect(links.some((l) => /[ក-៿]/.test(l.url))).toBe(true);
  });

  it('builds absolute URLs from the relative hrefs', () => {
    for (const link of parseListing(LISTING)) {
      expect(link.url).toMatch(/^https:\/\/www\.jobnet\.com\.kh\/job\//);
      expect(link.externalId).toMatch(/^\d+$/);
    }
  });

  it('returns nothing for a page with no postings', () => {
    expect(parseListing('<html><body>no jobs</body></html>')).toEqual([]);
  });
});

describe('JobNet JSON-LD extraction', () => {
  it('parses the block despite the unescaped control characters', () => {
    // This is the measured failure: a plain JSON.parse throws
    // "Invalid control character at line 6 column 494".
    expect(() => JSON.parse(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/i.exec(DETAIL)![1]))
      .toThrow();
    expect(extractJobPosting(DETAIL)).not.toBeNull();
  });

  it('returns null when there is no JSON-LD at all', () => {
    expect(extractJobPosting('<html><body>nothing</body></html>')).toBeNull();
  });

  it('returns null when the JSON-LD is not a JobPosting', () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}
    </script>`;
    expect(extractJobPosting(html)).toBeNull();
  });

  it('picks the JobPosting out of several blocks', () => {
    const html =
      `<script type="application/ld+json">{"@type":"Organization","name":"X"}</script>` +
      `<script type="application/ld+json">{"@type":"JobPosting","Title":"Real"}</script>`;
    expect(extractJobPosting(html)).toMatchObject({ Title: 'Real' });
  });
});

describe('JobNet detail parsing', () => {
  it('reads the real posting end to end', () => {
    const job = parseDetail(DETAIL, LINK)!;

    expect(job).toMatchObject({
      source: 'JOBNET',
      externalId: '6195',
      title: 'Event Assets Manager',
      companyName: 'Vattanac Brewery Limited',
      remoteType: 'ON_SITE',
      externalUrl: LINK.url,
      employmentType: 'FULL_TIME',
    });
  });

  it('reads the CAPITALISED Title key', () => {
    // schema.org specifies lowercase; jobnet writes `Title`. A direct `data.title` read
    // returns undefined and every posting looks unusable.
    expect(parseDetail(DETAIL, LINK)!.title).toBe('Event Assets Manager');
  });

  it('converts the HTML description to structured plain text', () => {
    const { description } = parseDetail(DETAIL, LINK)!;

    expect(description.length).toBeGreaterThan(500);
    // htmlToText contract: never markup, and paragraph structure survives.
    expect(description).not.toContain('<p>');
    expect(description).not.toContain('<strong>');
    expect(description).toContain('\n');
    expect(description).toContain('Position Objective');
  });

  it('joins the address without repeating the region', () => {
    // The real address is locality "Phnom Penh" AND region "Phnom Penh"; naive joining
    // gives "Phnom Penh, Phnom Penh, Cambodia".
    expect(parseDetail(DETAIL, LINK)!.location).toBe('Phnom Penh, Cambodia');
  });

  describe('what it must refuse rather than guess', () => {
    it('returns null when the JSON-LD is missing', () => {
      expect(parseDetail('<html><body>no ld</body></html>', LINK)).toBeNull();
    });

    it('returns null when the title is absent', () => {
      const html = `<script type="application/ld+json">
        {"@type":"JobPosting","hiringOrganization":{"name":"Acme"}}</script>`;
      expect(parseDetail(html, LINK)).toBeNull();
    });

    it('returns null when the hiring organisation is absent', () => {
      const html = `<script type="application/ld+json">
        {"@type":"JobPosting","Title":"Engineer"}</script>`;
      expect(parseDetail(html, LINK)).toBeNull();
    });

    it('leaves employmentType NULL for a value it does not recognise', () => {
      // "Contract or Full Time" is one thing on these boards and is not either enum.
      const html = `<script type="application/ld+json">{"@type":"JobPosting",
        "Title":"Engineer","hiringOrganization":{"name":"Acme"},
        "employmentType":"Contract or Full Time"}</script>`;
      expect(parseDetail(html, LINK)!.employmentType).toBeNull();
    });

    it('falls back to the title when the description is empty', () => {
      // Job.description is non-nullable; the title is the honest minimum.
      const html = `<script type="application/ld+json">{"@type":"JobPosting",
        "Title":"Engineer","hiringOrganization":{"name":"Acme"}}</script>`;
      expect(parseDetail(html, LINK)!.description).toBe('Engineer');
    });
  });
});
