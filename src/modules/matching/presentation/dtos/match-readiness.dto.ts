// src/modules/matching/presentation/dtos/match-readiness.dto.ts
//
// WHY AN EMPTY LIST IS EMPTY — the new-user case (docs/AI_DEGRADATION_PLAN.md §7).
//
// `GET /recommendations` returns an array. An empty array has at least four completely
// different causes, and the client currently renders all of them identically as
// "no matches":
//
//   1. The user has no profile yet            → onboarding is incomplete
//   2. The profile has no embedding yet       → we are still working
//   3. The embedding FAILED                   → we broke, and it will not fix itself
//   4. Everything worked, nothing scored      → genuinely no matches
//
// Only (4) is about the user. Showing (1)-(3) as "no jobs match you" tells a brand-new
// candidate in a market with 366 live postings that the product has nothing for them —
// which is not a degraded experience, it is a wrong and discouraging one.
//
// This is a SEPARATE endpoint rather than an envelope on the list because the list is
// already `RecommendedJobDto[]` in a published contract, and the PWA caches it. Adding a
// wrapper would break every existing client to serve an empty-state message.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Why matching cannot produce results — or `READY` when it can.
 *
 * Ordered by who has to act: the first two are the user's, the third is ours, the last is
 * nobody's.
 */
export type MatchReadinessState =
  | 'READY'
  | 'NO_PROFILE'
  | 'EMBEDDING_PENDING'
  | 'EMBEDDING_FAILED';

export class MatchReadinessDto {
  @ApiProperty({
    enum: ['READY', 'NO_PROFILE', 'EMBEDDING_PENDING', 'EMBEDDING_FAILED'],
    description:
      'READY means an empty recommendations list genuinely means "no matches". ' +
      'Anything else means the list is empty because of us or because onboarding is ' +
      'incomplete — do NOT render it as "no jobs match you".',
  })
  state: MatchReadinessState;

  @ApiProperty({
    description:
      'A sentence written for the candidate, not for a log. Safe to display verbatim.',
  })
  message: string;

  @ApiProperty({
    description:
      'Whether this resolves on its own. True: we are working, tell them to wait. ' +
      'False: it needs an action from them, or from us.',
  })
  transient: boolean;

  @ApiPropertyOptional({
    description:
      'What the user can do about it, when there is something. Absent when the next ' +
      'move is ours.',
  })
  action?: string;

  @ApiPropertyOptional({
    description:
      'When the profile embedding was last written. Absent if it never was.',
  })
  embeddedAt?: string;

  @ApiPropertyOptional({
    description:
      'The recorded failure, for support and debugging. NOT for display — it carries ' +
      'internal error codes.',
  })
  detail?: string;

  constructor(init: MatchReadinessDto) {
    this.state = init.state;
    this.message = init.message;
    this.transient = init.transient;
    this.action = init.action;
    this.embeddedAt = init.embeddedAt;
    this.detail = init.detail;
  }
}
