// src/shared/utils/company-identity.spec.ts
//
// The rule these pin: COMPANY NAME IS A DISPLAY ATTRIBUTE, NOT AN IDENTITY.
//
// Same name is a candidate. Same domain is the same business. If normalizeDomain ever
// stops collapsing a variation, two rows for one website become possible, and the whole
// conflict-detection layer above it goes quiet.

import {
  buildIdentityKey,
  domainFromEmail,
  isPublicDomain,
  isStrongIdentity,
  normalizeCompanyName,
  normalizeDomain,
} from './company-identity';

describe('normalizeDomain', () => {
  // All of these are the same website written by different people.
  it.each([
    'https://www.Acme-KH.com/careers?ref=x',
    'http://acme-kh.com',
    'ACME-KH.COM',
    '  https://acme-kh.com/  ',
    'www.acme-kh.com',
    'https://acme-kh.com:443/jobs#open',
    'acme-kh.com.',
  ])('collapses %s to acme-kh.com', (input) => {
    expect(normalizeDomain(input)).toBe('acme-kh.com');
  });

  // Free text must not become a domain — a bogus one would collide with a real company.
  it.each([null, undefined, '', '   ', 'we are on facebook', 'localhost', 'acme'])(
    'returns null for %s',
    (input) => {
      expect(normalizeDomain(input as string | null)).toBeNull();
    },
  );

  it('keeps genuinely different hosts apart', () => {
    expect(normalizeDomain('acme-kh.com')).not.toBe(normalizeDomain('acme-si.com'));
    // A subdomain is a different site until someone says otherwise; merging them would be
    // an unsafe automatic decision.
    expect(normalizeDomain('jobs.acme.com')).toBe('jobs.acme.com');
  });
});

describe('normalizeCompanyName', () => {
  it('collapses formatting only', () => {
    expect(normalizeCompanyName('  ACME   Robotics Co., Ltd. ')).toBe(
      'acme robotics co ltd',
    );
  });

  // Deliberate: "Acme" and "Acme Co., Ltd" may be different registered entities, and
  // merging them is the exact mistake this change exists to stop.
  it('does NOT strip legal suffixes', () => {
    expect(normalizeCompanyName('Acme')).not.toBe(
      normalizeCompanyName('Acme Co., Ltd'),
    );
  });
});

describe('buildIdentityKey', () => {
  it('prefers the domain when there is one', () => {
    expect(
      buildIdentityKey({ name: 'Acme Robotics', website: 'https://acme-kh.com' }),
    ).toBe('domain:acme-kh.com');
  });

  it('falls back to the name when there is no website — the scraped case', () => {
    expect(buildIdentityKey({ name: 'Acme Robotics' })).toBe('name:acme robotics');
  });

  // Requirement: same name + different website => two separate companies.
  it('gives two same-named companies different keys when their domains differ', () => {
    const kh = buildIdentityKey({ name: 'Acme Robotics', website: 'acme-kh.com' });
    const si = buildIdentityKey({ name: 'Acme Robotics', website: 'acme-si.com' });
    expect(kh).not.toBe(si);
  });

  // Requirement: same website => same identity, whatever it is called.
  it('gives two differently-named companies the SAME key when the domain matches', () => {
    expect(buildIdentityKey({ name: 'Acme Holdings', website: 'acme.com' })).toBe(
      buildIdentityKey({ name: 'Acme Robotics', website: 'https://www.acme.com/x' }),
    );
  });

  // The prefix is load-bearing: without it a scraped "Acme Robotics" and an employer's
  // acme-robotics.com could occupy one key and fight over the row.
  it('never lets a weak key collide with a strong one', () => {
    // Even a company literally NAMED after its domain cannot occupy the domain key: the
    // prefix separates the namespaces, and the name normalizer strips the dots anyway.
    const weak = buildIdentityKey({ name: 'acme-kh.com' });
    const strong = buildIdentityKey({ name: 'x', website: 'acme-kh.com' });
    expect(weak).toBe('name:acme-khcom');
    expect(strong).toBe('domain:acme-kh.com');
    expect(weak).not.toBe(strong);
  });

  it('reports which signal it used', () => {
    expect(isStrongIdentity('domain:acme.com')).toBe(true);
    expect(isStrongIdentity('name:acme')).toBe(false);
  });
});

describe('domainFromEmail', () => {
  it('takes the company domain from a work address', () => {
    expect(domainFromEmail('hr@github-kh.com')).toBe('github-kh.com');
    expect(domainFromEmail('  HR@Mail.GitHub-KH.com  ')).toBe('mail.github-kh.com');
  });

  // A consumer address identifies a person. Treating gmail.com as a company domain would
  // merge every gmail-using employer into one row — far worse than the weak name key.
  it.each(['me@gmail.com', 'me@yahoo.com', 'me@outlook.com', 'me@icloud.com'])(
    'refuses the consumer provider %s',
    (email) => {
      expect(domainFromEmail(email)).toBeNull();
      expect(isPublicDomain(email)).toBe(true);
    },
  );

  it.each([null, undefined, '', 'not-an-email'])('returns null for %s', (v) => {
    expect(domainFromEmail(v as string | null)).toBeNull();
  });
});

describe('buildIdentityKey — email fallback', () => {
  // The case that motivated this: the website is optional and employers skip it, so two
  // real companies both called "GitHub" both landed on name:github and the second could
  // not be onboarded.
  it('separates two same-named companies by their email domains', () => {
    const a = buildIdentityKey({ name: 'GitHub', email: 'hr@github.com' });
    const b = buildIdentityKey({ name: 'GitHub', email: 'hr@github-kh.com' });

    expect(a).toBe('domain:github.com');
    expect(b).toBe('domain:github-kh.com');
    expect(a).not.toBe(b);
  });

  it('prefers a stated website over the email — it is the company own claim', () => {
    expect(
      buildIdentityKey({
        name: 'GitHub',
        website: 'https://github.io',
        email: 'hr@github.com',
      }),
    ).toBe('domain:github.io');
  });

  // Unchanged behaviour: nothing to go on, so the weak key stands and the admin is asked.
  it('falls back to the name for a consumer address with no website', () => {
    expect(buildIdentityKey({ name: 'GitHub', email: 'mygithub@gmail.com' })).toBe(
      'name:github',
    );
  });

  it('still uses the name when there is neither — the scraped case', () => {
    expect(buildIdentityKey({ name: 'GitHub' })).toBe('name:github');
  });

  // An email-derived key and a website-derived key for the SAME domain must agree, or an
  // employer would create a duplicate of their own company.
  it('agrees whichever signal the domain came from', () => {
    expect(buildIdentityKey({ name: 'GitHub', email: 'hr@github.com' })).toBe(
      buildIdentityKey({ name: 'GitHub', website: 'https://www.github.com/about' }),
    );
  });
});
