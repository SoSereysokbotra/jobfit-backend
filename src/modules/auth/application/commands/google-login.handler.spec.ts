// src/modules/auth/application/commands/google-login.handler.spec.ts
//
// UNIT tests (no DB, no Redis, no Google). The verifier is substituted, so every case
// is about POLICY — who may sign in this way, and what gets recorded — not about JWTs.
//
// The cases that matter most are the refusals. A Google sign-in that can reach an admin
// session, or activate an employer that approval has not activated, is a way around two
// gates that exist for a reason. Those two tests are the reason this file exists.

import { GoogleLoginHandler } from './google-login.handler';
import { GoogleLoginCommand } from './google-login.command';
import { UserEntity, type UserRole } from '../../domain/entities/user.entity';
import type { GoogleIdentity } from '../../infrastructure/services/google-id-token.verifier';
import {
  GoogleSignInNotAllowedError,
  GoogleSignInNotConfiguredError,
  InvalidGoogleTokenError,
} from '../errors/auth.errors';
import { TERMS_VERSION } from '../auth.constants';

const IDENTITY: GoogleIdentity = {
  sub: 'google-sub-123',
  email: 'jane@example.com',
  emailVerified: true,
  name: 'Jane Doe',
};

function makeUser(role: UserRole, isVerified: boolean, extra: Partial<{ googleId: string }> = {}): UserEntity {
  const user = UserEntity.create({
    id: 'existing-id',
    email: 'jane@example.com',
    name: 'Jane',
    passwordHash: role === 'EMPLOYER' && !isVerified ? '' : 'old-hash',
    role,
  });
  if (isVerified) user.markVerified();
  if (extra.googleId) user.linkGoogle(extra.googleId);
  return user;
}

describe('GoogleLoginHandler', () => {
  let userRepo: { findByGoogleId: jest.Mock; findByEmail: jest.Mock; save: jest.Mock };
  let refreshRepo: { save: jest.Mock };
  let verifier: { isConfigured: jest.Mock; verify: jest.Mock };
  let security: { record: jest.Mock };
  let handler: GoogleLoginHandler;

  const cmd = () => new GoogleLoginCommand('some-id-token', '203.0.113.7');

  beforeEach(() => {
    userRepo = {
      findByGoogleId: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    refreshRepo = { save: jest.fn().mockResolvedValue(undefined) };
    verifier = {
      isConfigured: jest.fn().mockReturnValue(true),
      verify: jest.fn().mockResolvedValue(IDENTITY),
    };
    security = { record: jest.fn().mockResolvedValue(undefined) };
    const tokenService = {
      signAccessToken: jest.fn().mockReturnValue({ accessToken: 'access' }),
      signRefreshToken: jest
        .fn()
        .mockReturnValue({ refreshToken: 'refresh', expiresAt: new Date(Date.now() + 1000) }),
    };
    handler = new GoogleLoginHandler(
      userRepo as never,
      refreshRepo as never,
      tokenService as never,
      verifier as never,
      security as never,
    );
  });

  // ── refusals ──────────────────────────────────────────────────────────────

  it('answers "not configured" before touching the token when GOOGLE_CLIENT_ID is unset', async () => {
    verifier.isConfigured.mockReturnValue(false);
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(GoogleSignInNotConfiguredError);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('rejects a token the verifier does not accept, with no lookup and no record', async () => {
    verifier.verify.mockResolvedValue(null);
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(InvalidGoogleTokenError);
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an identity whose email Google has not verified', async () => {
    // Otherwise a Workspace account with an unconfirmed address could claim any email.
    verifier.verify.mockResolvedValue({ ...IDENTITY, emailVerified: false });
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(InvalidGoogleTokenError);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('never signs an ADMIN in through Google, even with a verified matching email', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser('ADMIN', true));
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(GoogleSignInNotAllowedError);
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(refreshRepo.save).not.toHaveBeenCalled();
  });

  it('refuses an approved-but-not-activated EMPLOYER — activation is a gate, not a formality', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser('EMPLOYER', false));
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(GoogleSignInNotAllowedError);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  // ── sign-ins ──────────────────────────────────────────────────────────────

  it('signs in an account already linked by sub, without consulting the email', async () => {
    userRepo.findByGoogleId.mockResolvedValue(makeUser('JOB_SEEKER', true, { googleId: IDENTITY.sub }));

    const result = await handler.execute(cmd());

    expect(result.isNewUser).toBe(false);
    expect(result.accessToken).toBe('access');
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
    expect(refreshRepo.save).toHaveBeenCalledTimes(1);
  });

  it('links a verified JOB_SEEKER found by email and signs them in', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser('JOB_SEEKER', true));

    const result = await handler.execute(cmd());

    const saved = userRepo.save.mock.calls[0][0] as UserEntity;
    expect(saved.id).toBe('existing-id');
    expect(saved.googleId).toBe(IDENTITY.sub);
    expect(result.isNewUser).toBe(false);
  });

  it('links an UNVERIFIED JOB_SEEKER and marks them verified — Google already proved the address', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser('JOB_SEEKER', false));

    await handler.execute(cmd());

    const saved = userRepo.save.mock.calls[0][0] as UserEntity;
    expect(saved.isVerified).toBe(true);
    expect(saved.googleId).toBe(IDENTITY.sub);
  });

  it('links an activated EMPLOYER and signs them in', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser('EMPLOYER', true));
    const result = await handler.execute(cmd());
    expect(result.isNewUser).toBe(false);
    expect((userRepo.save.mock.calls[0][0] as UserEntity).googleId).toBe(IDENTITY.sub);
  });

  // ── account creation ──────────────────────────────────────────────────────

  it('creates a verified, passwordless JOB_SEEKER when nothing matches', async () => {
    const result = await handler.execute(cmd());

    expect(result.isNewUser).toBe(true);
    const saved = userRepo.save.mock.calls[0][0] as UserEntity;
    expect(saved.role).toBe('JOB_SEEKER');
    expect(saved.isVerified).toBe(true);
    expect(saved.passwordHash).toBe('');
    expect(saved.googleId).toBe(IDENTITY.sub);
    expect(saved.name).toBe('Jane Doe');
    expect(saved.email).toBe('jane@example.com');
  });

  it('stamps the terms record on creation — clicking the button is the acceptance', async () => {
    await handler.execute(cmd());
    const saved = userRepo.save.mock.calls[0][0] as UserEntity;
    expect(saved.termsVersion).toBe(TERMS_VERSION);
    expect(saved.termsAcceptedIp).toBe('203.0.113.7');
    expect(saved.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it('records a LOGIN_SUCCEEDED security event that says it was Google', async () => {
    await handler.execute(cmd());
    expect(security.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'LOGIN_SUCCEEDED',
        email: 'jane@example.com',
        ipAddress: '203.0.113.7',
        detail: expect.stringContaining('Google'),
      }),
    );
  });

  it('lower-cases the email before matching, like every other auth path', async () => {
    verifier.verify.mockResolvedValue({ ...IDENTITY, email: 'Jane@Example.COM' });
    await handler.execute(cmd());
    expect(userRepo.findByEmail).toHaveBeenCalledWith('jane@example.com');
  });
});
