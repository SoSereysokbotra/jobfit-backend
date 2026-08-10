// src/common/conflict/version-conflict.exception.ts
//
// Optimistic concurrency for resources a user can edit from more than one device
// (PWA offline mode, Phase 4).
//
// The client sends the `updatedAt` it last saw. If the row has moved on since, the edit is
// refused rather than applied — a last-write-wins overwrite would silently destroy whatever
// the other device wrote, with nothing anywhere recording that it happened.
//
// The 409 body carries BOTH versions so a client can eventually show the user the two and
// let them choose. Resolving that choice is frontend scope; the backend's job is to make
// sure the information needed to build it is present.

import { ConflictException } from '@nestjs/common';

/** Marker consumed by AllExceptionsFilter (to preserve the body) and by BatchService. */
export const CONFLICT_MARKER = 'conflict' as const;

export interface VersionConflictBody {
  conflict: true;
  message: string;
  serverVersion: unknown;
  clientAttempted: unknown;
}

export class VersionConflictException extends ConflictException {
  constructor(serverVersion: unknown, clientAttempted: unknown) {
    const body: VersionConflictBody = {
      conflict: true,
      // `message` is also present so the generic error path (and any client reading only
      // `message`) still says something useful instead of "[object Object]".
      message:
        'This record changed on the server since you last loaded it. Your update was not ' +
        'applied. Compare serverVersion with clientAttempted and retry with the current ' +
        'expectedUpdatedAt.',
      serverVersion,
      clientAttempted,
    };
    super(body);
  }

  get body(): VersionConflictBody {
    return this.getResponse() as VersionConflictBody;
  }
}

/** True when an HttpException body is a version-conflict payload. */
export function isVersionConflictBody(
  value: unknown,
): value is VersionConflictBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { conflict?: unknown }).conflict === true
  );
}

/**
 * Compare what the client last saw against what the server currently holds.
 *
 * Timestamps are compared by millisecond value, not by reference or string: the client
 * round-trips `updatedAt` through JSON, so it arrives as an ISO string while the server
 * holds a Date. An unparseable value is treated as a mismatch — better to make the client
 * refetch than to let a malformed header wave an edit through.
 */
export function versionsMatch(
  serverUpdatedAt: Date,
  clientExpectedUpdatedAt: string | Date,
): boolean {
  const expected =
    clientExpectedUpdatedAt instanceof Date
      ? clientExpectedUpdatedAt.getTime()
      : Date.parse(clientExpectedUpdatedAt);

  if (!Number.isFinite(expected)) return false;
  return serverUpdatedAt.getTime() === expected;
}

/**
 * Throw a 409 carrying both versions unless the client's expectation is current.
 *
 * `serverVersion` is built lazily so the (sometimes non-trivial) projection only runs on
 * the conflict path.
 */
export function assertVersionMatches(params: {
  serverUpdatedAt: Date;
  clientExpectedUpdatedAt: string | Date;
  serverVersion: () => unknown;
  clientAttempted: unknown;
}): void {
  if (versionsMatch(params.serverUpdatedAt, params.clientExpectedUpdatedAt)) {
    return;
  }
  throw new VersionConflictException(
    params.serverVersion(),
    params.clientAttempted,
  );
}
