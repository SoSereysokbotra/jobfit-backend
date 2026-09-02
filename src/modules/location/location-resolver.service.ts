// Loads the `locations` table into memory once, then answers resolution questions.
//
// The algorithm itself lives in location-index.ts (pure, fixture-tested). This class is
// only the Nest/Prisma wiring around it.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { LocationIndex } from './location-index';
import { LocationRecord, ResolvedPlace } from './location.types';

@Injectable()
export class LocationResolverService implements OnModuleInit {
  private readonly logger = new Logger(LocationResolverService.name);
  private index: LocationIndex | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the index at boot.
   *
   * DEGRADES, NEVER THROWS. An empty or unreachable `locations` table leaves the index
   * null, every resolution returns null, and callers exclude location from the score —
   * the same path an unrecognised city already takes. A missing reference table must not
   * stop the API from booting.
   */
  async onModuleInit(): Promise<void> {
    try {
      const started = Date.now();
      const before = process.memoryUsage().heapUsed;

      const rows = await this.prisma.location.findMany({
        select: {
          geonameId: true,
          name: true,
          asciiName: true,
          alternateNames: true,
          countryCode: true,
          countryName: true,
          admin1Code: true,
          admin1Name: true,
          population: true,
        },
      });

      if (rows.length === 0) {
        this.logger.warn(
          'locations table is empty — location scoring will be excluded from every match. ' +
            'Run: npx ts-node -r tsconfig-paths/register scripts/import-geonames.ts',
        );
        return;
      }

      this.index = new LocationIndex(rows as LocationRecord[]);
      const heapMb = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
      this.logger.log(
        `Location index ready: ${rows.length} places, ${this.index.keyCount} lookup keys, ` +
          `~${heapMb.toFixed(0)} MB heap, ${Date.now() - started} ms`,
      );
    } catch (error) {
      this.logger.error(`Failed to build the location index: ${String(error)}`);
    }
  }

  /** True once the table has been loaded; false means every resolution returns null. */
  get isReady(): boolean {
    return this.index !== null;
  }

  /** Resolve a free-text location as written on a job page. */
  resolveText(raw: string | null | undefined): ResolvedPlace | null {
    return this.index?.resolveText(raw) ?? null;
  }

  /** Resolve a profile's structured city + country. */
  resolveStructured(
    city: string | null | undefined,
    country: string | null | undefined,
  ): ResolvedPlace | null {
    return this.index?.resolveStructured(city, country) ?? null;
  }
}
