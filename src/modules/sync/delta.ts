// src/modules/sync/delta.ts
//
// Shared pieces of the delta-sync contract: the cursor codec and the Prisma `where`
// fragment every per-resource delta query builds on. Kept in one place so the eight
// resources cannot drift apart on paging semantics.
//
// WHY A CURSOR AND NOT skip/take. The rest of the codebase pages with offsets
// (SearchJobQueryDto's limit/offset, ApplicationRepository's skip/take). Offsets are
// fine for interactive browsing but wrong here: rows are ordered by updatedAt, and a
// row updated mid-pagination MOVES, so an offset walk silently skips or repeats
// records. A sync that drops a record leaves the client permanently stale, with no
// signal anything went wrong. The cursor is keyed on the full sort tuple
// (updatedAt, id) — `id` breaks ties, without which rows sharing a millisecond
// order arbitrarily in Postgres and paging is again lossy.

/** Rows a delta query can return in one page before a cursor is issued. */
export const DEFAULT_SYNC_LIMIT = 100;
export const MAX_SYNC_LIMIT = 500;

export interface DeltaCursor {
  updatedAt: Date;
  id: string;
}

export interface DeltaOptions {
  /** Only rows changed strictly after this. Omitted = full sync. */
  since?: Date;
  cursor?: DeltaCursor;
  limit: number;
}

/** One page of a delta: live rows to upsert, ids to delete, and where to resume. */
export interface DeltaPage<T> {
  upserts: T[];
  deletes: string[];
  nextCursor: string | null;
}

/** Anything a delta query can page over. */
export interface DeltaRow {
  id: string;
  updatedAt: Date;
  deletedAt?: Date | null;
}

/**
 * Opaque, URL-safe cursor. Opaque on purpose — clients must treat it as a token and
 * echo it back, so the sort key can change later without breaking them.
 */
export function encodeCursor(row: DeltaRow): string {
  return Buffer.from(`${row.updatedAt.toISOString()}|${row.id}`).toString(
    'base64url',
  );
}

/** Returns undefined for anything unparseable — a bad cursor restarts the page, never throws. */
export function decodeCursor(cursor?: string): DeltaCursor | undefined {
  if (!cursor) return undefined;
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const updatedAt = new Date(iso);
    if (!id || Number.isNaN(updatedAt.getTime())) return undefined;
    return { updatedAt, id };
  } catch {
    return undefined;
  }
}

/**
 * The `where` fragment shared by every delta query: rows belonging to this user,
 * changed since the watermark, positioned after the cursor.
 *
 * The userId term is not optional and not caller-supplied — every delta query is
 * self-scoped by construction, so there is no code path that can forget it.
 *
 * Note this deliberately does NOT filter deletedAt: soft-deleted rows are the whole
 * point of a delta, and splitDelta separates them out afterwards.
 */
export function deltaWhere(
  userId: string,
  options: DeltaOptions,
): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  if (options.since) and.push({ updatedAt: { gt: options.since } });

  if (options.cursor) {
    // Strictly after (updatedAt, id) in the composite sort order.
    and.push({
      OR: [
        { updatedAt: { gt: options.cursor.updatedAt } },
        { updatedAt: options.cursor.updatedAt, id: { gt: options.cursor.id } },
      ],
    });
  }

  return and.length > 0 ? { userId, AND: and } : { userId };
}

/** Stable total order. Both terms are required — see the tie-break note above. */
export const DELTA_ORDER_BY = [
  { updatedAt: 'asc' as const },
  { id: 'asc' as const },
];

/**
 * Split one over-fetched page into upserts, tombstones and the next cursor.
 *
 * Callers query `limit + 1` rows; the extra row is the has-more probe and is dropped.
 */
export function splitDelta<Row extends DeltaRow, T>(
  rows: Row[],
  limit: number,
  map: (row: Row) => T,
): DeltaPage<T> {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const upserts: T[] = [];
  const deletes: string[] = [];

  for (const row of page) {
    // A soft-deleted row is a tombstone, never an upsert — a client that received both
    // would resurrect it depending on apply order.
    if (row.deletedAt) deletes.push(row.id);
    else upserts.push(map(row));
  }

  return {
    upserts,
    deletes,
    nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : null,
  };
}
