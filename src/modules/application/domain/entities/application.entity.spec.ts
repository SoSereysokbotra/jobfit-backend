// Status lifecycle rules.
//
// Two properties are load-bearing and were both broken in the shipped app:
//  1. A candidate can ALWAYS withdraw from an active application.
//  2. Statuses that record an employer decision are not the candidate's to set.

import {
  Application,
  CANDIDATE_SETTABLE_STATUSES,
  EMPLOYER_SETTABLE_STATUSES,
  candidateActionsFrom,
  employerActionsFrom,
  isTransitionAllowed,
} from './application.entity';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';

const make = (status: ApplicationStatus) =>
  Application.create({ userId: 'u1', jobId: 'j1', status });

describe('Application status transitions', () => {
  const ACTIVE = [
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.SCREENING,
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.OFFER,
    ApplicationStatus.NEGOTIATING,
  ];

  it.each(ACTIVE)('allows withdrawing from %s', (status) => {
    // Previously WITHDRAWN was reachable only from SUBMITTED. Automatic screening then
    // moved every new application straight to SCREENING, so withdrawal became
    // unreachable for everyone — the one action a candidate is always entitled to take.
    const application = make(status);

    expect(() => application.updateStatus(ApplicationStatus.WITHDRAWN)).not.toThrow();
    expect(application.status).toBe(ApplicationStatus.WITHDRAWN);
  });

  it('allows archiving a finished application', () => {
    for (const status of [
      ApplicationStatus.ACCEPTED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.WITHDRAWN,
    ]) {
      const application = make(status);
      expect(() => application.updateStatus(ApplicationStatus.ARCHIVED)).not.toThrow();
    }
  });

  it('still refuses to skip stages', () => {
    // Loosening withdrawal must not loosen the pipeline itself.
    const application = make(ApplicationStatus.SUBMITTED);

    expect(() => application.updateStatus(ApplicationStatus.OFFER)).toThrow(
      /Invalid status transition/,
    );
  });

  it('treats ARCHIVED as terminal', () => {
    const application = make(ApplicationStatus.ARCHIVED);

    expect(() => application.updateStatus(ApplicationStatus.SUBMITTED)).toThrow();
  });

  it('raises a status-changed event', () => {
    const application = make(ApplicationStatus.SCREENING);
    application.clearDomainEvents();

    application.updateStatus(ApplicationStatus.WITHDRAWN);

    expect(application.getDomainEvents()).toHaveLength(1);
  });
});

describe('CANDIDATE_SETTABLE_STATUSES', () => {
  it('lets a candidate withdraw, archive, and answer an offer', () => {
    expect(CANDIDATE_SETTABLE_STATUSES).toEqual(
      expect.arrayContaining([
        ApplicationStatus.WITHDRAWN,
        ApplicationStatus.ARCHIVED,
        ApplicationStatus.ACCEPTED,
        ApplicationStatus.NEGOTIATING,
      ]),
    );
  });

  it.each([
    ApplicationStatus.SCREENING,
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.OFFER,
    ApplicationStatus.REJECTED,
  ])('does NOT let a candidate set %s', (status) => {
    // These record what the EMPLOYER decided. A candidate asserting one would fabricate
    // a hiring outcome inside the employer's own pipeline view.
    expect(CANDIDATE_SETTABLE_STATUSES).not.toContain(status);
  });
});

describe('EMPLOYER_SETTABLE_STATUSES', () => {
  it('lets an employer move a candidate through the hiring pipeline', () => {
    expect(EMPLOYER_SETTABLE_STATUSES).toEqual(
      expect.arrayContaining([
        ApplicationStatus.SCREENING,
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.OFFER,
        ApplicationStatus.REJECTED,
      ]),
    );
  });

  it.each([
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ACCEPTED,
    ApplicationStatus.NEGOTIATING,
  ])('does NOT let an employer set %s', (status) => {
    // These are the CANDIDATE's decisions. An employer setting WITHDRAWN would record
    // that the candidate pulled out when they did not; ACCEPTED, that they took a job
    // they never agreed to.
    expect(EMPLOYER_SETTABLE_STATUSES).not.toContain(status);
  });

  it('gives the two roles no overlapping decision except archiving', () => {
    const overlap = EMPLOYER_SETTABLE_STATUSES.filter((s) =>
      CANDIDATE_SETTABLE_STATUSES.includes(s),
    );
    expect(overlap).toEqual([ApplicationStatus.ARCHIVED]);
  });
});

describe('isTransitionAllowed', () => {
  // The employer pipeline writes through Prisma rather than the aggregate, so it needs
  // the rule table as a function or it enforces nothing at all — which is what it did.
  it('agrees with the aggregate', () => {
    expect(
      isTransitionAllowed(ApplicationStatus.SCREENING, ApplicationStatus.INTERVIEW),
    ).toBe(true);
    expect(
      isTransitionAllowed(ApplicationStatus.SUBMITTED, ApplicationStatus.ACCEPTED),
    ).toBe(false);
  });

  it('blocks jumping straight to a hire', () => {
    expect(
      isTransitionAllowed(ApplicationStatus.SUBMITTED, ApplicationStatus.OFFER),
    ).toBe(false);
  });
});

describe('employerActionsFrom', () => {
  // Served on the pipeline DTO so the board can derive its drop targets instead of
  // keeping a second copy of these rules. Pinned exactly, per status, because the whole
  // value of serving them is that the UI can trust them.
  it.each([
    [ApplicationStatus.DRAFT, []],
    // NOT INTERVIEW. Screening never throws, so an application whose screening could not
    // run stays SUBMITTED — and sits in the same board column as SCREENING ones. This is
    // why the board must ask per card, not per column.
    [ApplicationStatus.SUBMITTED, [ApplicationStatus.SCREENING, ApplicationStatus.REJECTED]],
    [
      ApplicationStatus.SCREENING,
      [ApplicationStatus.INTERVIEW, ApplicationStatus.OFFER, ApplicationStatus.REJECTED],
    ],
    [ApplicationStatus.INTERVIEW, [ApplicationStatus.OFFER, ApplicationStatus.REJECTED]],
    // From OFFER the employer has exactly one move left. Accepting, negotiating and
    // withdrawing are the candidate's replies.
    [ApplicationStatus.OFFER, [ApplicationStatus.REJECTED]],
    [ApplicationStatus.NEGOTIATING, [ApplicationStatus.OFFER, ApplicationStatus.REJECTED]],
    [ApplicationStatus.ACCEPTED, [ApplicationStatus.ARCHIVED]],
    // Reopening a closed application is an employer action (D2).
    [ApplicationStatus.REJECTED, [ApplicationStatus.SCREENING, ApplicationStatus.ARCHIVED]],
    [ApplicationStatus.WITHDRAWN, [ApplicationStatus.ARCHIVED]],
    [ApplicationStatus.ARCHIVED, []],
  ])('from %s', (from, expected) => {
    expect(employerActionsFrom(from as ApplicationStatus)).toEqual(expected);
  });

  it('never offers the employer a status that is the candidate\'s to decide', () => {
    const every = Object.values(ApplicationStatus).flatMap((s) =>
      employerActionsFrom(s),
    );
    expect(every).not.toContain(ApplicationStatus.ACCEPTED);
    expect(every).not.toContain(ApplicationStatus.WITHDRAWN);
    expect(every).not.toContain(ApplicationStatus.NEGOTIATING);
  });

  it('mirrors candidateActionsFrom rather than duplicating its logic', () => {
    // Both are TRANSITIONS filtered by a settable list, so no status may appear in both
    // answers for the same state except ARCHIVED — the one decision either party can make.
    for (const status of Object.values(ApplicationStatus)) {
      const overlap = employerActionsFrom(status).filter((s) =>
        candidateActionsFrom(status).includes(s),
      );
      expect(overlap.filter((s) => s !== ApplicationStatus.ARCHIVED)).toEqual([]);
    }
  });
});
