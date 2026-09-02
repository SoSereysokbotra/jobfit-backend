import { Module } from '@nestjs/common';

import { LocationResolverService } from './location-resolver.service';

/**
 * Place resolution — turns free-text locations into rows of the `locations` reference
 * table so location matching can ask "same city / same province / same country" instead
 * of comparing strings. See docs/LOCATION_MATCHING_ROOT_PROBLEM.md.
 *
 * Global-ish by intent: matching, match-report and (phase 3) a lookup controller all
 * need the same single in-memory index. It is exported rather than re-instantiated so
 * the 34k-row table is loaded exactly once per process.
 */
@Module({
  providers: [LocationResolverService],
  exports: [LocationResolverService],
})
export class LocationModule {}
