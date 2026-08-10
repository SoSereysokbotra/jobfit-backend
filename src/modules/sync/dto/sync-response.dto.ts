// src/modules/sync/dto/sync-response.dto.ts
//
// The delta envelope every /sync/* route returns.
//
// `serverTime` is the watermark for the NEXT call and is read before the queries run, so
// a row written mid-request lands after the watermark and is picked up next time. Taking
// it afterwards would open a window in which a write is newer than the queries but older
// than the watermark, and would be skipped forever.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncEnvelopeDto<T> {
  @ApiPropertyOptional({
    description:
      'The `since` that was queried, echoed back. Null on a full sync.',
    nullable: true,
  })
  since: string | null;

  @ApiProperty({
    description:
      'Server clock, ISO-8601. Pass this as `since` on the next sync — never the ' +
      'client clock.',
  })
  serverTime: string;

  @ApiProperty({ description: 'Rows created or updated since `since`.', isArray: true })
  upserts: T[];

  @ApiProperty({
    description:
      'Ids of rows soft-deleted since `since` — remove these from the local cache. ' +
      'Always empty for resources without soft deletes (see each route’s notes).',
    type: [String],
  })
  deletes: string[];

  @ApiProperty({
    description:
      'Cursor for the next page, or null when this page is the last. While non-null, ' +
      'keep calling with the same `since` and this `cursor` before advancing the watermark.',
    nullable: true,
  })
  nextCursor: string | null;

  @ApiPropertyOptional({
    description:
      'When true this payload is the COMPLETE set, not a delta — replace the local ' +
      'collection wholesale rather than merging. Set for resources that cannot express ' +
      'deletions incrementally (currently saved-jobs).',
  })
  fullReplace?: boolean;

  constructor(params: {
    since: Date | null;
    serverTime: Date;
    upserts: T[];
    deletes: string[];
    nextCursor: string | null;
    fullReplace?: boolean;
  }) {
    this.since = params.since ? params.since.toISOString() : null;
    this.serverTime = params.serverTime.toISOString();
    this.upserts = params.upserts;
    this.deletes = params.deletes;
    this.nextCursor = params.nextCursor;
    if (params.fullReplace) this.fullReplace = true;
  }
}
