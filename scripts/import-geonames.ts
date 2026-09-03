// Import GeoNames place data into the `locations` table.
//
//   npx ts-node -r tsconfig-paths/register scripts/import-geonames.ts
//   npx ts-node -r tsconfig-paths/register scripts/import-geonames.ts --replace
//
// WHY THIS EXISTS: location scoring compared two free-text strings with a regex, so a
// user's match score depended on how they spelled their own city — "Phnom Penh" matched
// a job listed as "Toul Kork, Phnom Penh" while Khmer script or "PP" scored the same as
// a job in Bangkok. See docs/LOCATION_MATCHING_ROOT_PROBLEM.md. This table is the shared
// vocabulary both sides get resolved into; phase 1 builds the resolver on top of it.
//
// THE DATASET: geonames.org `cities15000` — every city over 15,000 people, worldwide,
// CC BY 4.0. Verified 2026-09-02: 34,129 cities, 252 countries, 3,865 admin1 codes.
// It is deliberately WORLDWIDE and country-agnostic: there is no per-country list and no
// special case for any market. If coverage proves too thin, `cities5000` is the same
// import with a bigger file and no code change (see CITIES_FILE below).
//
// IDEMPOTENT. Rows are keyed on GeoNames' own `geonameId`; a plain re-run inserts only
// what is missing and leaves the count unchanged. Pass `--replace` to wipe and reload,
// which is how you pick up upstream data changes or switch to a denser file.
//
// NO NEW DEPENDENCY. The archive is unpacked by reading the ZIP central directory and
// inflating with stdlib `zlib` — a maintenance script does not justify a package.

import { PrismaClient } from '@prisma/client';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const BASE_URL = 'https://download.geonames.org/export/dump';
// Swap to 'cities5000' (~50k) or 'cities1000' (~140k) for denser coverage. Nothing else
// changes — same columns, same parser.
const CITIES_FILE = 'cities15000';
const BATCH_SIZE = 500; // through the Supabase transaction pooler

const prisma = new PrismaClient();

// ─── Fetch + unzip ──────────────────────────────────────────────────────────

async function download(fileName: string, cacheDir: string): Promise<Buffer> {
  const cached = path.join(cacheDir, fileName);
  if (fs.existsSync(cached)) {
    console.log(`  ${fileName}: cached`);
    return fs.readFileSync(cached);
  }
  const url = `${BASE_URL}/${fileName}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} → ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(cached, buffer);
  console.log(`  ${fileName}: downloaded ${(buffer.length / 1024).toFixed(0)} KB`);
  return buffer;
}

/**
 * Extract the first entry of a ZIP archive.
 *
 * Reads the CENTRAL DIRECTORY rather than the local file header on purpose: when the
 * archive sets the streaming bit, the local header carries zeroes for both sizes and the
 * real values live in a trailing data descriptor. The central directory always has them.
 */
function unzipFirstEntry(zip: Buffer): Buffer {
  // End of Central Directory record — scan back from the end for its signature.
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive: no end-of-central-directory record');

  const cdOffset = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt32LE(cdOffset) !== 0x02014b50) {
    throw new Error('Corrupt ZIP: central directory signature missing');
  }

  const method = zip.readUInt16LE(cdOffset + 10);
  const compressedSize = zip.readUInt32LE(cdOffset + 20);
  const nameLength = zip.readUInt16LE(cdOffset + 28);
  const localOffset = zip.readUInt32LE(cdOffset + 42);
  const entryName = zip.subarray(cdOffset + 46, cdOffset + 46 + nameLength).toString();

  // The local header's own name/extra lengths are what locate the data.
  const localNameLength = zip.readUInt16LE(localOffset + 26);
  const localExtraLength = zip.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localNameLength + localExtraLength;
  const data = zip.subarray(dataStart, dataStart + compressedSize);

  console.log(`  unzipped ${entryName} (method ${method})`);
  if (method === 0) return Buffer.from(data); // stored
  if (method === 8) return zlib.inflateRawSync(data); // deflate
  throw new Error(`Unsupported ZIP compression method ${method}`);
}

// ─── Parsers (all files are tab-separated, '#' comments) ────────────────────

function tsvRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.startsWith('#'))
    .map((line) => line.replace(/\r$/, '').split('\t'));
}

/** ISO-3166 alpha-2 → country name. countryInfo.txt: ISO at col 0, name at col 4. */
function parseCountries(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const cols of tsvRows(text)) {
    if (cols[0] && cols[4]) map.set(cols[0], cols[4]);
  }
  return map;
}

/** "KH.22" → "Phnom Penh". admin1CodesASCII.txt: key at col 0, name at col 1. */
function parseAdmin1(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const cols of tsvRows(text)) {
    if (cols[0] && cols[1]) map.set(cols[0], cols[1]);
  }
  return map;
}

interface LocationRow {
  geonameId: number;
  name: string;
  asciiName: string;
  alternateNames: string[];
  countryCode: string;
  countryName: string;
  admin1Code: string | null;
  admin1Name: string | null;
  population: number;
  latitude: number | null;
  longitude: number | null;
}

/**
 * cities15000.txt is 19 tab-separated columns:
 *   0 geonameid · 1 name · 2 asciiname · 3 alternatenames · 4 lat · 5 lng
 *   6 feature class · 7 feature code · 8 country code · 9 cc2 · 10 admin1 code
 *   11-13 admin2-4 · 14 population · 15 elevation · 16 dem · 17 timezone · 18 modified
 */
function parseCities(
  text: string,
  countries: Map<string, string>,
  admin1: Map<string, string>,
): { rows: LocationRow[]; skipped: number } {
  const rows: LocationRow[] = [];
  let skipped = 0;

  for (const cols of tsvRows(text)) {
    if (cols.length < 19) {
      skipped++;
      continue;
    }
    const geonameId = Number.parseInt(cols[0], 10);
    const countryCode = cols[8];
    // A row we cannot name a country for is unusable for hierarchy scoring — skipping is
    // correct, and the count is reported rather than swallowed.
    if (!Number.isFinite(geonameId) || !countryCode || !countries.has(countryCode)) {
      skipped++;
      continue;
    }

    // Blank admin1 is legitimate (city-states — Singapore). Stored as NULL, never "",
    // so a consumer cannot mistake two unknowns for the same province.
    const admin1Code = cols[10]?.trim() || null;
    const admin1Name = admin1Code ? (admin1.get(`${countryCode}.${admin1Code}`) ?? null) : null;

    const latitude = Number.parseFloat(cols[4]);
    const longitude = Number.parseFloat(cols[5]);

    rows.push({
      geonameId,
      name: cols[1],
      asciiName: cols[2],
      alternateNames: cols[3] ? cols[3].split(',').filter((a) => a.trim().length > 0) : [],
      countryCode,
      countryName: countries.get(countryCode)!,
      admin1Code,
      admin1Name,
      population: Number.parseInt(cols[14], 10) || 0,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
    });
  }
  return { rows, skipped };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const replace = process.argv.includes('--replace');

  const cacheDir = path.join(os.tmpdir(), 'jobfit-geonames');
  fs.mkdirSync(cacheDir, { recursive: true });
  console.log(`Cache: ${cacheDir}`);

  console.log('Fetching GeoNames files...');
  const [citiesZip, admin1Raw, countryRaw] = await Promise.all([
    download(`${CITIES_FILE}.zip`, cacheDir),
    download('admin1CodesASCII.txt', cacheDir),
    download('countryInfo.txt', cacheDir),
  ]);

  const countries = parseCountries(countryRaw.toString('utf8'));
  const admin1 = parseAdmin1(admin1Raw.toString('utf8'));
  const { rows, skipped } = parseCities(
    unzipFirstEntry(citiesZip).toString('utf8'),
    countries,
    admin1,
  );

  console.log(
    `Parsed: ${rows.length} cities · ${countries.size} countries · ${admin1.size} admin1 codes` +
      (skipped > 0 ? ` · ${skipped} rows skipped` : ''),
  );
  if (rows.length === 0) throw new Error('Parsed 0 cities — refusing to touch the table');

  const before = await prisma.location.count();
  if (replace) {
    console.log(`--replace: deleting ${before} existing rows`);
    await prisma.location.deleteMany({});
  }

  // `skipDuplicates` on the geonameId unique index is what makes a plain re-run
  // idempotent: existing places are left alone, only genuinely new ones land.
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const result = await prisma.location.createMany({ data: batch, skipDuplicates: true });
    inserted += result.count;
    process.stdout.write(
      `\r  inserted ${inserted} / ${rows.length} (batch ${Math.floor(i / BATCH_SIZE) + 1})   `,
    );
  }
  process.stdout.write('\n');

  const after = await prisma.location.count();
  console.log(`Done. locations: ${before} → ${after} (${inserted} inserted this run)`);
}

main()
  .catch((error) => {
    console.error('Import failed:', error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
