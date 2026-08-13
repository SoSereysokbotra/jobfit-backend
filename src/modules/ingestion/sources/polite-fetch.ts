// src/modules/ingestion/sources/polite-fetch.ts
//
// HTTP for the job-board adapters, with the manners that make ingestion defensible.
//
// Neither bongthom.com nor jobnet.com.kh publishes a robots.txt, so no crawl-delay is
// declared and none is implied. That is a reason to be MORE conservative, not less: with
// no stated limit we pick one we would be comfortable defending, and we identify
// ourselves so the site can block us if they would rather we did not.
//
// Being blockable is deliberate. A browser-spoofing User-Agent is what turns aggregation
// into something adversarial.

const USER_AGENT =
  'JobFitsBot/1.0 (+https://github.com/SoSereysokbotra/jobfit-backend; job aggregator; contact via repository)';

/** Minimum gap between requests to the SAME host. */
const MIN_INTERVAL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 20_000;

/** Last request time per host, so one slow source cannot starve another. */
const lastRequestAt = new Map<string, number>();

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET a URL as text, rate-limited per host and identified.
 *
 * Throws on a non-2xx so callers can count it as a skip rather than silently storing an
 * error page — both of these sites answer 200 with HTML for URLs that do not exist, so a
 * status check alone is not enough and callers must also validate what came back.
 */
export async function politeFetchText(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const host = new URL(url).host;
  const since = Date.now() - (lastRequestAt.get(host) ?? 0);
  if (since < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - since);
  lastRequestAt.set(host, Date.now());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en,km;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`${url} responded ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/** Decode the handful of XML/HTML entities that appear in these feeds. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    // Last, so "&amp;lt;" does not decode into a tag.
    .replace(/&amp;/gi, '&');
}
