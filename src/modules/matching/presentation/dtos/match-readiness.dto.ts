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
//   4. Their own hard constraint excluded everything → their preferences are too narrow
//   5. Everything worked, nothing scored      → genuinely no matches
//
// Only (4) and (5) are about the user. Showing (1)-(3) as "no jobs match you" tells a
// brand-new candidate in a market with 366 live postings that the product has nothing for
// them — which is not a degraded experience, it is a wrong and discouraging one.
//
// (4) IS NEW, and it is not the same answer as (5). "Remote only" is now a hard retrieval
// constraint rather than a preference nobody read, and on this corpus 4 of 368 published
// jobs are REMOTE — so a remote-only candidate can legitimately retrieve nothing. Under
// (5) the client says "no jobs match you", which reads as a verdict on the CANDIDATE when
// the true cause is a filter they set and can undo. Telling those apart is the same
// distinction this endpoint exists to make.
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
  | 'EMBEDDING_FAILED'
  | 'NO_MATCHES_FOR_CONSTRAINTS';

/**
 * A hard constraint the candidate set that retrieval enforces as a filter.
 *
 * Only REMOTE_ONLY exists today. It is a LIST and a named type rather than a boolean so
 * adding the next one (a salary floor, once that filter is enabled) does not change the
 * response shape or need a new state.
 */
export type MatchConstraint = 'REMOTE_ONLY';

export class MatchReadinessDto {
  @ApiProperty({
    enum: [
      'READY',
      'NO_PROFILE',
      'EMBEDDING_PENDING',
      'EMBEDDING_FAILED',
      'NO_MATCHES_FOR_CONSTRAINTS',
    ],
    description:
      'READY means an empty recommendations list genuinely means "no matches". ' +
      'NO_MATCHES_FOR_CONSTRAINTS means the candidate WOULD have matches but their own ' +
      'hard filter removed them — render it as "widen your preferences", never as "no ' +
      'jobs match you". Anything else means the list is empty because of us or because ' +
      'onboarding is incomplete — also not "no jobs match you".',
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

  @ApiPropertyOptional({
    isArray: true,
    enum: ['REMOTE_ONLY'],
    description:
      "Which of the candidate's own hard filters emptied the list. Present only on " +
      'NO_MATCHES_FOR_CONSTRAINTS. Machine-readable so the client can name the exact ' +
      'setting to relax and link to it, rather than parsing `message`.',
  })
  constraints?: MatchConstraint[];

  @ApiPropertyOptional({
    description:
      'How many jobs retrieval found for this candidate IGNORING the constraints above ' +
      '— i.e. how many they would see if they relaxed them. Lets the client say ' +
      '"12 jobs matched you, but none are remote". ' +
      'A FLOOR, NOT AN EXACT TOTAL: retrieval stops at its pool size, so this saturates ' +
      '(currently at 50). Word it as "at least N" once it reaches that ceiling rather ' +
      'than quoting it as a count.',
  })
  matchedIgnoringConstraints?: number;

  constructor(init: MatchReadinessDto) {
    this.state = init.state;
    this.message = init.message;
    this.transient = init.transient;
    this.action = init.action;
    this.embeddedAt = init.embeddedAt;
    this.detail = init.detail;
    this.constraints = init.constraints;
    this.matchedIgnoringConstraints = init.matchedIgnoringConstraints;
  }
}
