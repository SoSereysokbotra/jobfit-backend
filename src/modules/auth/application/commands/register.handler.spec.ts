// src/modules/auth/application/commands/register.handler.spec.ts
//
// UNIT test (no DB, no Redis) for the duplicate-address gate in Flow 1.
//
// The case that matters is the third one. An unverified user row is normally a
// half-finished signup and is safe to reuse, but EmployerApprovalService.approve creates a
// REAL EMPLOYER row with `emailVerified: false` and an empty password hash, and leaves it
// that way until the employer redeems their activation code. Before this gate checked the
// role, a signup during that window fell into the reuse branch, rewrote the password on
// the employer's row and left `role` as EMPLOYER — so the person got an employer account
// they never asked for.

import { RegisterHandler } from './register.handler';
import { RegisterCommand } from './register.command';
import { AuthDomainService } from '../../domain/services/auth.domain.service';
import { UserEntity, type UserRole } from '../../domain/entities/user.entity';
import { EmailAlreadyRegisteredError } from '../errors/auth.errors';

const PASSWORD = 'S3curePass';

function makeUser(role: UserRole, isVerified: boolean): UserEntity {
  const user = UserEntity.create({
    id: 'existing-id',
    email: 'jane@techcorp.com',
    name: 'Jane',
    passwordHash: role === 'EMPLOYER' ? '' : 'old-hash',
    role,
  });
  if (isVerified) user.markVerified();
  return user;
}

describe('RegisterHandler — duplicate address gate', () => {
  let userRepo: { findByEmail: jest.Mock; save: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let handler: RegisterHandler;

  beforeEach(() => {
    userRepo = { findByEmail: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };
    handler = new RegisterHandler(
      userRepo as never,
      new AuthDomainService(),
      eventEmitter as never,
    );
  });

  it('creates a new account when the address is free', async () => {
    userRepo.findByEmail.mockResolvedValue(null);

    await handler.execute(new RegisterCommand('jane@techcorp.com', PASSWORD, 'Jane'));

    expect(userRepo.save).toHaveBeenCalledTimes(1);
    const saved = userRepo.save.mock.calls[0][0] as UserEntity;
    expect(saved.role).toBe('JOB_SEEKER');
    expect(saved.isVerified).toBe(false);
  });

  it('reuses the row of an unverified JOB_SEEKER (half-finished signup)', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser('JOB_SEEKER', false));

    await handler.execute(new RegisterCommand('jane@techcorp.com', PASSWORD, 'Jane'));

    const saved = userRepo.save.mock.calls[0][0] as UserEntity;
    expect(saved.id).toBe('existing-id');
    expect(saved.passwordHash).not.toBe('old-hash');
  });

  it('refuses an approved-but-not-yet-activated EMPLOYER row instead of reusing it', async () => {
    const employer = makeUser('EMPLOYER', false);
    userRepo.findByEmail.mockResolvedValue(employer);

    await expect(
      handler.execute(new RegisterCommand('jane@techcorp.com', PASSWORD, 'Jane')),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);

    // Nothing was written, and in particular the employer's row still has the empty hash
    // that keeps it un-signable-in until activation.
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
    expect(employer.passwordHash).toBe('');
    expect(employer.role).toBe('EMPLOYER');
  });

  it('refuses a verified account (the ordinary taken-address case)', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser('JOB_SEEKER', true));

    await expect(
      handler.execute(new RegisterCommand('jane@techcorp.com', PASSWORD, 'Jane')),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);

    expect(userRepo.save).not.toHaveBeenCalled();
  });
});
