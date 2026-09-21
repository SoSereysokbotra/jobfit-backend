// src/modules/auth/application/commands/google-login.handler.ts
// Google sign-in: one endpoint for both "log in" and "create an account".
//
// THE FLOW IS ID-TOKEN, NOT REDIRECT. The browser shows Google's button, Google hands
// the browser a signed ID token, the browser posts it here. The backend never holds a
// client secret and never sees Google's redirect dance; it verifies a signature against
// Google's public keys and checks the token was minted for our client id. That is the
// whole exchange, and it is why this handler is shorter than LoginHandler.
//
// WHO MAY SIGN IN THIS WAY — the policy this file owns:
//
//   1. An account already linked to this Google `sub`     → sign in.
//   2. No account, no matching email                       → create a JOB_SEEKER, verified,
//                                                            no password, terms stamped.
//   3. A JOB_SEEKER with this email (verified or not)      → link and sign in. Google has
//                                                            verified the address, which is
//                                                            the same proof our 6-digit code
//                                                            asks for.
//   4. An EMPLOYER that is verified/activated             → link and sign in.
//   5. An EMPLOYER that is NOT yet activated               → refuse. Activation is a gate
//                                                            (approval + code redemption);
//                                                            Google must not be a way round it.
//   6. An ADMIN                                            → refuse, always. An admin's
//                                                            session must not be obtainable
//                                                            with a Google password alone.
//
// Lookup is by `sub` FIRST and email second. Google emails can be changed, and a deleted
// Google account's address can be reissued; `sub` never moves. Trusting email first
// would let a recycled address inherit someone else's JobFits account.

import { Inject } from '@nestjs/common';
import { SecurityEventType } from '@prisma/client';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { v4 as uuidv4 } from 'uuid';
import { GoogleLoginCommand } from './google-login.command';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { UserEntity } from '../../domain/entities/user.entity';
import { AuthTokenService } from '../../infrastructure/services/auth-token.service';
import {
  GoogleIdTokenVerifier,
  type GoogleIdentity,
} from '../../infrastructure/services/google-id-token.verifier';
import { SecurityEventService } from '@shared/services/security-event.service';
import {
  GoogleSignInNotAllowedError,
  GoogleSignInNotConfiguredError,
  InvalidGoogleTokenError,
} from '../errors/auth.errors';
import { TERMS_VERSION } from '../auth.constants';
import type { LoginResult } from './login.handler';

export interface GoogleLoginResult extends LoginResult {
  /** True when this call created the account — the client routes to onboarding. */
  isNewUser: boolean;
}

@CommandHandler(GoogleLoginCommand)
export class GoogleLoginHandler implements ICommandHandler<GoogleLoginCommand> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly tokenService: AuthTokenService,
    private readonly verifier: GoogleIdTokenVerifier,
    private readonly security: SecurityEventService,
  ) {}

  async execute(command: GoogleLoginCommand): Promise<GoogleLoginResult> {
    if (!this.verifier.isConfigured()) throw new GoogleSignInNotConfiguredError();

    const identity = await this.verifier.verify(command.idToken);
    if (!identity) throw new InvalidGoogleTokenError();

    // Google marks an address unverified when the account was created with an email
    // Google itself never confirmed (some Workspace and legacy cases). Linking or
    // creating on that basis would be trusting a claim nobody checked.
    if (!identity.emailVerified) throw new InvalidGoogleTokenError();

    const email = identity.email.toLowerCase().trim();
    let user = await this.userRepo.findByGoogleId(identity.sub);
    let isNewUser = false;

    if (!user) {
      const byEmail = await this.userRepo.findByEmail(email);
      if (byEmail) {
        this.assertMayLink(byEmail);
        byEmail.linkGoogle(identity.sub);
        user = byEmail;
      } else {
        user = this.createFromGoogle(identity, email, command.ipAddress);
        isNewUser = true;
      }
    }

    user.recordLogin();
    await this.userRepo.save(user);
    await this.security.record({
      eventType: SecurityEventType.LOGIN_SUCCEEDED,
      email,
      userId: user.id,
      ipAddress: command.ipAddress,
      detail: isNewUser ? 'Google sign-in (account created)' : 'Google sign-in',
    });

    return { ...(await this.issueSession(user)), isNewUser };
  }

  /** Cases 4–6 in the file comment. Throws for the ones Google may not bypass. */
  private assertMayLink(user: UserEntity): void {
    if (user.role === 'ADMIN') throw new GoogleSignInNotAllowedError();
    if (user.role === 'EMPLOYER' && !user.isVerified) {
      throw new GoogleSignInNotAllowedError();
    }
  }

  /** Case 2. Verified, passwordless, terms stamped with the version in force now. */
  private createFromGoogle(
    identity: GoogleIdentity,
    email: string,
    ip: string,
  ): UserEntity {
    return UserEntity.create({
      id: uuidv4(),
      email,
      name: identity.name ?? undefined,
      // No password. bcrypt.compare(anything, '') is false, so password login fails
      // cleanly until the user sets one through the reset flow.
      passwordHash: '',
      googleId: identity.sub,
      // Clicking "Continue with Google" is the acceptance; the button copy says so, and
      // the same three facts are recorded as for a form signup (D7).
      termsVersion: TERMS_VERSION,
      termsAcceptedIp: ip,
    });
  }

  /** Identical to LoginHandler's tail — access token + persisted, hashed refresh token. */
  private async issueSession(user: UserEntity): Promise<LoginResult> {
    const { accessToken } = this.tokenService.signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const { refreshToken, expiresAt } = this.tokenService.signRefreshToken(user.id);
    await this.refreshTokenRepo.save(
      RefreshTokenEntity.create({
        id: uuidv4(),
        userId: user.id,
        rawToken: refreshToken,
        expiresAt,
      }),
    );
    return { accessToken, refreshToken, user: user.toSafe() };
  }
}
