// Repair profile locations that the place resolver cannot read.
//
//   npx ts-node -r tsconfig-paths/register scripts/backfill-profile-locations.ts
//   npx ts-node -r tsconfig-paths/register scripts/backfill-profile-locations.ts --apply
//
// DRY RUN BY DEFAULT. Nothing is written without --apply.
//
// WHY: the onboarding wizard used to split "San Francisco, CA" on the comma and store
// the tail as the COUNTRY. "CA" is a US state code, and also Canada's ISO code — so the
// profile claims a country the user never chose, and the resolver correctly refuses to
// place it (there is no San Francisco in Canada). Those profiles score with location
// EXCLUDED, which is honest but loses a real signal the user did supply.
// See docs/LOCATION_MATCHING_ROOT_PROBLEM.md.
//
// CONSERVATIVE ON PURPOSE. This is user-entered data, so a row is only rewritten when
// the evidence is corroborated, never merely plausible:
//
//   · the stored country is exactly two letters (a state code, not a country name), AND
//   · the city name resolves to exactly ONE country, AND
//   · that place's admin1Code equals the stored two-letter value.
//
// The last condition is what makes it a correction rather than a guess: the stored "CA"
// has to actually be the province the city sits in. Anything ambiguous is REPORTED and
// left alone — a wrong country is recoverable, a silently overwritten one is not.
//
// The state code is preserved in `state` rather than discarded, so no information is
// lost by the repair.

import { PrismaClient } from '@prisma/client';
import { LocationIndex } from '../src/modules/location/location-index';
import { LocationRecord } from '../src/modules/location/location.types';

const prisma = new PrismaClient();

interface Repair {
  id: string;
  city: string;
  from: { state: string | null; country: string };
  to: { state: string; country: string };
  evidence: string;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const rows = (await prisma.location.findMany({
    select: {
      geonameId: true, name: true, asciiName: true, alternateNames: true,
      countryCode: true, countryName: true, admin1Code: true, admin1Name: true,
      population: true,
    },
  })) as LocationRecord[];
  if (rows.length === 0) {
    throw new Error('locations table is empty — run scripts/import-geonames.ts first');
  }
  const index = new LocationIndex(rows);

  const profiles = await prisma.profile.findMany({
    select: { id: true, city: true, state: true, country: true },
  });

  const repairs: Repair[] = [];
  const stillBroken: typeof profiles = [];
  let alreadyFine = 0;
  let noLocation = 0;

  for (const profile of profiles) {
    if (!profile.city && !profile.country) {
      noLocation++;
      continue;
    }
    if (index.resolveStructured(profile.city, profile.country)) {
      alreadyFine++;
      continue;
    }

    const city = profile.city?.trim();
    const stored = profile.country?.trim();
    if (!city || !stored || stored.length !== 2) {
      stillBroken.push(profile);
      continue;
    }

    // Every place with this name, anywhere, whose province IS the stored code.
    const matches = index
      .searchCities({ query: city, limit: 50 })
      .filter((candidate) => candidate.name.toLowerCase() === city.toLowerCase());
    const inThatProvince = matches.filter(
      (candidate) =>
        (candidate.admin1Name ?? '').length > 0 &&
        index.resolveStructured(candidate.name, candidate.countryName)?.admin1Code?.toUpperCase() ===
          stored.toUpperCase(),
    );
    const countries = new Set(inThatProvince.map((candidate) => candidate.countryCode));

    if (inThatProvince.length === 0 || countries.size !== 1) {
      stillBroken.push(profile);
      continue;
    }

    const place = inThatProvince[0];
    repairs.push({
      id: profile.id,
      city,
      from: { state: profile.state, country: stored },
      to: { state: stored, country: place.countryName },
      evidence: `${place.name} is in ${place.admin1Name} (${stored}), ${place.countryName}`,
    });
  }

  console.log(`profiles: ${profiles.length}`);
  console.log(`  no location entered:      ${noLocation}`);
  console.log(`  already resolve:          ${alreadyFine}`);
  console.log(`  repairable (corroborated): ${repairs.length}`);
  console.log(`  left alone (ambiguous):    ${stillBroken.length}`);

  for (const repair of repairs) {
    console.log(
      `\n  ${repair.city}: country "${repair.from.country}" -> "${repair.to.country}"` +
        `, state "${repair.from.state ?? ''}" -> "${repair.to.state}"\n    because ${repair.evidence}`,
    );
  }
  for (const profile of stillBroken) {
    console.log(
      `\n  LEFT ALONE city=${JSON.stringify(profile.city)} country=${JSON.stringify(profile.country)}` +
        ' — not corroborated; a human should decide',
    );
  }

  if (!apply) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to write ${repairs.length} row(s).`);
    return;
  }

  for (const repair of repairs) {
    await prisma.profile.update({
      where: { id: repair.id },
      data: { state: repair.to.state, country: repair.to.country },
    });
  }
  console.log(`\nAPPLIED: ${repairs.length} profile(s) updated.`);

  // Prove the repair achieved its purpose rather than merely running.
  const after = await prisma.profile.findMany({ select: { city: true, country: true } });
  const resolving = after.filter(
    (profile) => (profile.city || profile.country) && index.resolveStructured(profile.city, profile.country),
  ).length;
  const withLocation = after.filter((profile) => profile.city || profile.country).length;
  console.log(`Profiles with a location that now resolves: ${resolving}/${withLocation}`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
