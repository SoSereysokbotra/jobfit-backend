// Status lifecycle rules.
//
// Two properties are load-bearing and were both broken in the shipped app:
//  1. A candidate can ALWAYS withdraw from an active application.
//  2. Statuses that record an employer decision are not the candidate's to set.

import {
  Application,
  CANDIDATE_SETTABLE_STATUSES,
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
