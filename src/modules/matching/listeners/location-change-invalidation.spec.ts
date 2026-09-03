// A location-only profile edit must invalidate that user's cached recommendations —
// EVEN WHEN THE EMBEDDING STEP FAILS.
//
// THE BUG THIS PINS. A user based in the US changed their profile to Cambodia and their
// recommendations went on serving US jobs. `buildCandidateText` builds the candidate
// vector from headline, bio, industries and the résumé — city and country are not in it —
// so a location edit produces an identical vector and its whole effect is on the
// deterministic location sub-score, which `scoreJobs` reads from `profiles.city`/`country`
// at score time. The listener nonetheless marked the cache stale only when the embed
// returned true, so with the AI service down (the condition this file mocks) the
// invalidation was skipped. The event is fire-and-forget with no queue and no retry, so
// it was not skipped — it was lost, and the cache served the old country indefinitely.
//
// Goes through EventEmitterModule rather than calling the listener directly, so the
// @OnEvent wiring is covered too: publishing the event a location edit actually raises
// has to reach the listener, not just the method behind it.

import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { DomainEventBus } from '@events/domain-event-bus.service';
import { MatchingEmbeddingService } from '../application/services/matching-embedding.service';
import { RecommendationStalenessService } from '../application/services/recommendation-staleness.service';
import { UserProfileUpdatedListener } from './user-profile-updated.listener';
import { ProfileUpdatedEvent } from '../../user/domain/events/profile-updated.event';
import { PreferencesUpdatedEvent } from '../../user/domain/events/preferences-updated.event';

describe('a location change invalidates the recommendation cache', () => {
  let bus: DomainEventBus;
  let markStale: jest.Mock;
  let embedCandidate: jest.Mock;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    // The AI service is DOWN — the exact condition under which the invalidation used to
    // be dropped. embedCandidate returns false rather than throwing when it cannot embed.
    embedCandidate = jest.fn().mockResolvedValue(false);
    markStale = jest.fn().mockResolvedValue(12);

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        DomainEventBus,
        UserProfileUpdatedListener,
        {
          provide: MatchingEmbeddingService,
          useValue: { embedCandidate, embedCandidateByResume: jest.fn() },
        },
        {
          provide: RecommendationStalenessService,
          useValue: { markStale, markStaleByResume: jest.fn() },
        },
      ],
    }).compile();

    await moduleRef.init();
    bus = moduleRef.get(DomainEventBus);
  });

  afterEach(() => jest.restoreAllMocks());

  it('marks the cache stale when the profile location changes and the embed fails', async () => {
    // What ProfileService.updateProfile raises for a location edit.
    await bus.publish(
      new ProfileUpdatedEvent(
        'user-who-moved',
        'profile',
        { city: 'San Francisco', country: 'United States' },
        { city: 'Phnom Penh', country: 'Cambodia' },
      ),
    );

    expect(embedCandidate).toHaveBeenCalledWith('user-who-moved');
    // The assertion the bug turned on: the embed said false, and the cache is STILL
    // invalidated, because location does not live in the vector.
    expect(markStale).toHaveBeenCalledWith('user-who-moved');
  });

  it('does the same for a preferences change', async () => {
    await bus.publish(new PreferencesUpdatedEvent('user-who-moved'));

    expect(markStale).toHaveBeenCalledWith('user-who-moved');
  });

  it('still marks stale when the embed throws outright', async () => {
    embedCandidate.mockRejectedValue(new Error('AI service unreachable'));

    await bus.publish(
      new ProfileUpdatedEvent('user-who-moved', 'profile', {}, {}),
    );

    expect(markStale).toHaveBeenCalledWith('user-who-moved');
  });
});
