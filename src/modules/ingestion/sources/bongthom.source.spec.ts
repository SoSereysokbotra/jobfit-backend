// BongThom feed parsing, against a REAL captured feed (test/fixtures/ingestion).
//
// Fixtures rather than mocked strings: a hand-written sample only proves the parser
// handles what its author imagined. The quirks that actually break this parser — the
// employer name buried in CDATA, the id hidden in a guid — are only visible in the real
// thing.
//
// These tests cannot detect bongthom CHANGING their feed; nothing offline can. They exist
// to catch US breaking the parser. The live-run skip count is what catches them.

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFeed } from './bongthom.source';

const FIXTURE = readFileSync(
  join(__dirname, '../../../../test/fixtures/ingestion/bongthom-rss.xml'),
  'utf8',
);

describe('BongThom feed parsing', () => {
  it('pulls the fields the feed actually carries', () => {
    const items = parseFeed(FIXTURE);

    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toEqual({
      externalId: expect.stringMatching(/^\d+$/),
      title: expect.any(String),
      companyName: expect.any(String),
      link: expect.stringContaining('bongthom.com/job_detail/'),
    });
  });

  it('extracts the id from the guid, which is not a plain number', () => {
    // The guid reads "btdc-id: 41023" — using it verbatim would make the dedup key
    // "btdc-id: 41023" and break the (source, externalId) unique constraint's intent.
    const items = parseFeed(FIXTURE);
    for (const item of items) {
      expect(item.externalId).toMatch(/^\d+$/);
      expect(item.externalId).not.toContain('btdc');
    }
  });

  it('extracts the employer from inside the CDATA description', () => {
    // The employer is not a field: it is "<strong>Employer:</strong> Name<br/>" inside a
    // CDATA blob that also holds a logo <img>.
    const items = parseFeed(FIXTURE);
    for (const item of items) {
      expect(item.companyName.length).toBeGreaterThan(0);
      expect(item.companyName).not.toContain('<');
      expect(item.companyName).not.toContain('Employer:');
      expect(item.companyName).not.toContain('img');
    }
  });

  it('decodes entities in the employer name', () => {
    // Real feed content includes "Krawma &amp; Associates Co., Ltd."
    const items = parseFeed(FIXTURE);
    expect(items.some((i) => i.companyName.includes('&'))).toBe(true);
    expect(items.every((i) => !i.companyName.includes('&amp;'))).toBe(true);
  });

  describe('items it must drop rather than guess at', () => {
    it('drops an item with no guid — it has no stable dedup key', () => {
      // Without an id, every run would insert the posting again.
      const xml = `<rss><channel><item>
        <title>Some Job</title>
        <link>https://www.bongthom.com/job_detail/x_1.html</link>
        <description><![CDATA[<strong>Employer:</strong> Acme<br/>]]></description>
      </item></channel></rss>`;
      expect(parseFeed(xml)).toEqual([]);
    });

    it('drops an item with no employer', () => {
      const xml = `<rss><channel><item>
        <title>Some Job</title>
        <link>https://www.bongthom.com/job_detail/x_1.html</link>
        <guid isPermaLink="false">btdc-id: 1</guid>
        <description><![CDATA[no employer here]]></description>
      </item></channel></rss>`;
      expect(parseFeed(xml)).toEqual([]);
    });

    it('returns nothing for an empty or non-feed document', () => {
      expect(parseFeed('')).toEqual([]);
      expect(parseFeed('<html><body>not a feed</body></html>')).toEqual([]);
    });
  });
});
