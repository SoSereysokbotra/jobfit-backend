/**
 * Who is causing an application status change.
 *
 * This exists because the actor used to be implicit in WHICH FILE the caller stood in, and
 * that is precisely how the rules got skipped: offer.service.ts holds the employer path and
 * the candidate path in one file, so neither entitlement rule felt like it applied and
 * neither was enforced. Passing the actor makes the rule a function of data, not of location.
 */
export enum TransitionActor {
  CANDIDATE = 'CANDIDATE',
  EMPLOYER = 'EMPLOYER',
  /**
   * The system itself — automatic screening, scheduled jobs. NOT a bypass: SYSTEM skips the
   * entitlement check (nobody asserted a decision, so there is no "whose call was this"
   * question) but still obeys TRANSITIONS. The lifecycle governs what states may follow what;
   * the settable lists govern entitlement. Collapsing the two into one god-mode flag would
   * recreate the problem this service exists to fix, under a nicer name.
   */
  SYSTEM = 'SYSTEM',
}
