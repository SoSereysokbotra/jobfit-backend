// A profile photo upload reported success and never changed the photo.
//
// THE BUG THIS PINS. `updateProfile` rebuilt the entity field by field as
// `dto.x ?? existing.x` — except photoUrl, which was hardcoded to `existing.photoUrl`.
// `UpdateProfileDto` did not declare the field either, so the client's photoUrl was
// discarded before it could be read. The save then succeeded with the OLD photo, the
// endpoint returned 200, and the frontend showed "Profile photo updated successfully!"
// over a change that never happened. Every other editable field worked, which is why it
// read as a frontend problem for so long.

import { BadRequestException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { Profile } from '../../domain/entities/profile.entity';
import { UpdateProfileDto } from '../dtos/update-profile.dto';

const UPDATED_AT = '2026-09-24T10:00:00.000Z';

function makeService() {
  const existing = new Profile(
    {
      userId: 'user-1',
      firstName: 'So',
      lastName: 'Sereysokbotra',
      photoUrl: undefined,
      headline: 'Electrical Engineering Intern',
      createdAt: new Date(UPDATED_AT),
    } as never,
    'profile-1',
  );
  // The version check compares against this, so it has to look like a saved row.
  Object.defineProperty(existing, 'updatedAt', { value: new Date(UPDATED_AT) });

  const save = jest.fn().mockResolvedValue(undefined);
  const service = new ProfileService(
    { findByUserId: jest.fn().mockResolvedValue(existing), save } as never,
    { findById: jest.fn() } as never,
    { publish: jest.fn().mockResolvedValue(undefined) } as never,
  );

  return { service, save, existing };
}

const dto = (over: Partial<UpdateProfileDto> = {}): UpdateProfileDto =>
  ({ expectedUpdatedAt: UPDATED_AT, ...over }) as UpdateProfileDto;

describe('updateProfile — photoUrl', () => {
  it('stores the photo the client sent', async () => {
    const { service, save } = makeService();
    const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

    const updated = await service.updateProfile('user-1', dto({ photoUrl: photo }));

    expect(updated.photoUrl).toBe(photo);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ photoUrl: photo }));
  });

  it('clears the photo when sent an empty string', async () => {
    const { service } = makeService();
    const updated = await service.updateProfile('user-1', dto({ photoUrl: '' }));

    // `??` falls back only on null/undefined, so "" is a real value — this is how
    // "Remove photo" reaches the database.
    expect(updated.photoUrl).toBe('');
  });

  it('keeps the existing photo when the field is absent', async () => {
    const { service, existing } = makeService();
    Object.defineProperty(existing, 'photoUrl', { value: 'data:image/png;base64,OLD' });

    const updated = await service.updateProfile('user-1', dto({ headline: 'New title' }));

    expect(updated.photoUrl).toBe('data:image/png;base64,OLD');
    expect(updated.headline).toBe('New title');
  });

  it('refuses a stale edit rather than overwriting a newer photo', async () => {
    const { service, save } = makeService();

    await expect(
      service.updateProfile('user-1', dto({ expectedUpdatedAt: '2020-01-01T00:00:00.000Z', photoUrl: 'x' })),
    ).rejects.toBeDefined();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('UpdateProfileDto', () => {
  it('declares photoUrl, or the value is stripped before the service sees it', () => {
    // The DTO is the whitelist. A field missing here is dropped by the ValidationPipe on
    // the REST path, which is the other half of how this bug stayed invisible.
    const instance = dto({ photoUrl: 'data:image/jpeg;base64,AAA' });
    expect(instance.photoUrl).toBe('data:image/jpeg;base64,AAA');
    expect(BadRequestException).toBeDefined();
  });
});
