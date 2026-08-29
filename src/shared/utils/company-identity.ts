// src/shared/utils/company-identity.ts
//
// COMPANY NAME IS A DISPLAY ATTRIBUTE, NOT AN IDENTITY.
//
// Two real businesses can share a name — "Acme Robotics" in Phnom Penh and "Acme Robotics"
// in Siem Reap are different companies with different owners. `Company.name @unique` said
// otherwise, which meant the second one could not be onboarded at all, and the approve
// dialog nudged an admin toward binding its recruiter to the first one's record.
//
// What actually identifies a company is its DOMAIN. What we have, however, depends on where
// the row came from:
//
//   - an employer request carries a website          -> strong identity
//   - a scraped job carries a company NAME and nothing else. No source in
//     `ingestion.types.ts` publishes a company website, so for those rows a normalized
//     name is the only signal that exists.
//
// So identity is one column, `identityKey`, that says which signal it is built from:
//
//     domain:acme-kh.com     strong — two rows cannot share a domain
//     name:acme robotics     weak   — the ingestion fallback, dedups scraped jobs
//
// Encoding the SOURCE of the identity in the value is what keeps the two from colliding: a
// scraped "Acme Robotics" and an employer's acme-kh.com never occupy the same key, so
// adding the second does not fight the first. It also keeps ONE unique index, which is what
// lets ingestion keep using `upsert` — a findFirst-then-create would race.

/**
 * `https://www.Acme-KH.com/careers?ref=x` -> `acme-kh.com`
 *
 * Strips protocol, `www.`, port, path, query and fragment, and lower-cases. Returns null
 * for anything that does not yield a host with a dot in it, so free text like "we are on
 * facebook" does not become a domain.
 */
export function normalizeDomain(
  website: string | null | undefined,
): string | null {
  if (!website) return null;
  const raw = website.trim();
  if (!raw) return null;

  let host: string;
  try {
    // A bare "acme.com" has no protocol, and the URL constructor requires one.
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
      ? raw
      : `https://${raw}`;
    host = new URL(withProtocol).hostname;
  } catch {
    // Not parseable as a URL — fall back to the leading token, which covers values that
    // were already bare hosts with something odd appended.
    host = raw.split(/[/?#\s]/)[0] ?? '';
  }

  const cleaned = host
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, ''); // a trailing dot is a valid FQDN but not a distinct site

  // Must look like a hostname: at least one dot, no spaces, no empty labels.
  if (!cleaned || !cleaned.includes('.') || /\s/.test(cleaned)) return null;
  if (cleaned.split('.').some((label) => label.length === 0)) return null;

  return cleaned;
}

/**
 * Free consumer mail providers.
 *
 * An address at one of these identifies a PERSON, not a business — `me@gmail.com` says
 * nothing about which company they work for. So a company email on one of these cannot
 * stand in for a website, and an employer request from one is flagged for the admin to
 * lean on the business documents instead.
 */
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
  'qq.com',
  '163.com',
]);

/** True when the address is at a consumer provider rather than a company's own domain. */
export function isPublicDomain(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return PUBLIC_EMAIL_DOMAINS.has(email.slice(at + 1).trim().toLowerCase());
}

/**
 * The company domain implied by a work address — `hr@github-kh.com` -> `github-kh.com`.
 *
 * Null for a consumer provider, because `me@gmail.com` identifies a person and treating it
 * as a company domain would merge every gmail-using employer into one row.
 */
export function domainFromEmail(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  if (isPublicDomain(email)) return null;
  return normalizeDomain(email.slice(at + 1));
}

/**
 * `  ACME   Robotics Co., Ltd.  ` -> `acme robotics co ltd`
 *
 * Only for the WEAK key. Collapses case, whitespace and punctuation so that the same
 * scraped employer written three slightly different ways lands on one row.
 *
 * ⚠️ Deliberately does NOT strip suffixes like "Co., Ltd" — "Acme" and "Acme Co., Ltd"
 * may be different registered entities, and merging them is the mistake this whole change
 * exists to stop. It normalizes FORMATTING, not meaning.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[.,''`"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The value stored in `Company.identityKey`.
 *
 * Domain wins whenever there is one. A company that later gains a website moves from the
 * weak key to the strong one — see the `identityKeyFor` callers, which recompute on update.
 */
export function buildIdentityKey(input: {
  name: string;
  website?: string | null;
  /**
   * The employer's own contact address, used when no website was given.
   *
   * The website is optional on the intake form and people skip it; the company email is
   * REQUIRED, and `hr@github-kh.com` says which business they are just as well as a
   * website does. Without this, two companies both called "GitHub" with no website both
   * land on `name:github` and the second cannot be onboarded at all.
   */
  email?: string | null;
}): string {
  // A stated website wins: it is the company's own claim about itself.
  const domain = normalizeDomain(input.website) ?? domainFromEmail(input.email);
  if (domain) return `domain:${domain}`;
  // Neither — a consumer address and no site. Nothing distinguishes two same-named
  // companies here, so the weak key stands and the admin is asked for a website.
  return `name:${normalizeCompanyName(input.name)}`;
}

/** True when this key came from a domain — i.e. it is a strong claim, not a guess. */
export function isStrongIdentity(identityKey: string): boolean {
  return identityKey.startsWith('domain:');
}
