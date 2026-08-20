// Tests for SavedExternalJobService.
//
// This is a bookmark, so the things worth pinning are the ones a user would notice going
// wrong: pressing Save twice must not produce two copies of the same job, an empty
// optional box must not be stored as the string " ", and a delete must never reach
// another account's row.

import { SavedExternalJobService } from './saved-external-job.service';

const ROW = {
  id: 's1',
  userId: 'u1',
  source: 'linkedin',
  externalId: '123',
  title: 'Interpreter — Khmer speaking',
  company: 'TP',
  description: 'About the job…',
  url: 'https://www.linkedin.com/jobs/view/123',
  salary: null,
  notes: null,
  createdAt: new Date('2026-08-13T00:00:00Z'),
  updatedAt: new Date('2026-08-13T00:00:00Z'),
};

function build() {
  const repository: any = {
    save: jest.fn(async (input: Record<string, unknown>) => ({ ...ROW, ...input })),
    findByUser: jest.fn().mockResolvedValue([ROW]),
    findOne: jest.fn().mockResolvedValue(null),
    remove: jest.fn().mockResolvedValue(true),
  };
  return { service: new SavedExternalJobService(repository), repository };
}

const INPUT = {
  externalId: '123',
  source: 'linkedin',
  title: 'Interpreter — Khmer speaking',
  company: 'TP',
  description: 'About the job…',
  url: 'https://www.linkedin.com/jobs/view/123',
};

describe('SavedExternalJobService', () => {
  it('saves the form and returns it with an id', async () => {
    const { service } = build();
    const saved = await service.save('u1', INPUT as never);

    expect(saved).toMatchObject({ id: 's1', title: 'Interpreter — Khmer speaking' });
    expect(saved.savedAt).toBe('2026-08-13T00:00:00.000Z');
  });

  it('stores an empty optional box as absent, not as blank text', async () => {
    // A "   " salary would render as an empty-but-present field forever after.
    const { service, repository } = build();
    await service.save('u1', { ...INPUT, salary: '   ', notes: '' } as never);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ salary: null, notes: null }),
    );
  });

  it('trims what it does store', async () => {
    const { service, repository } = build();
    await service.save('u1', { ...INPUT, title: '  Interpreter  ', salary: ' $700 ' } as never);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Interpreter', salary: '$700' }),
    );
  });

  it('upserts on the (user, source, externalId) key rather than inserting', async () => {
    // Pressing Save twice means correcting the salary, not asking for a duplicate.
    const { service, repository } = build();
    await service.save('u1', INPUT as never);
    await service.save('u1', { ...INPUT, salary: '$900' } as never);

    expect(repository.save).toHaveBeenCalledTimes(2);
    for (const call of repository.save.mock.calls) {
      expect(call[0]).toMatchObject({ userId: 'u1', source: 'linkedin', externalId: '123' });
    }
  });

  it('returns null — never undefined — when a posting is not saved', async () => {
    // An undefined here drops the `data` key from the response envelope and the
    // extension's unwrap() hands the whole envelope to the UI.
    const { service } = build();
    expect(await service.findOne('u1', 'linkedin', 'nope')).toBeNull();
  });

  it('scopes deletes to the caller', async () => {
    const { service, repository } = build();
    await service.remove('u1', 's1');

    expect(repository.remove).toHaveBeenCalledWith('u1', 's1');
  });
});
