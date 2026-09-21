// src/modules/auth/infrastructure/services/google-id-token.verifier.ts
//
// The ONE place a Google ID token is checked. Wraps google-auth-library so the handler
// depends on a four-field result rather than on Google's payload shape, and so tests can
// substitute a verifier instead of forging JWTs.
//
// WHAT "VERIFIED" MEANS HERE, and every part of it matters:
//   · signature — against Google's current public keys (the library fetches and caches
//     them; an offline box cannot verify and the sign-in fails closed);
//   · audience — the token was minted for OUR client id, not some other app's. Without
//     this check any site a user has ever signed into with Google could log them into
//     JobFits;
//   · issuer and expiry — handled by the library.
// `email_verified` is returned rather than enforced: it is a policy decision, and the
// handler owns policy.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  /** Google's stable subject id. The identity, as opposed to the (changeable) email. */
  sub: string;
  email: string;
  emailVerified: boolean;
  /** Display name as Google has it; may be absent for some account types. */
  name: string | null;
}

@Injectable()
export class GoogleIdTokenVerifier {
  private readonly clientId: string;
  private readonly client: OAuth2Client;

  constructor(config: ConfigService) {
    // '' counts as unset — see env.validation.ts. Read once: the value cannot change
    // without a redeploy, and re-reading per request would only hide a misconfiguration
    // until the first sign-in attempt.
    this.clientId = (config.get<string>('GOOGLE_CLIENT_ID') ?? '').trim();
    this.client = new OAuth2Client(this.clientId || undefined);
  }

  /** False when GOOGLE_CLIENT_ID is unset; the endpoint should answer 503, not 401. */
  isConfigured(): boolean {
    return this.clientId.length > 0;
  }

  /**
   * Verify and unpack, or return null for ANY failure.
   *
   * Null, not a thrown reason: the distinction between "expired", "wrong audience" and
   * "not a JWT" is useful to an attacker probing the endpoint and useless to a real
   * user, who just needs to press the button again.
   */
  async verify(idToken: string): Promise<GoogleIdentity | null> {
    if (!this.isConfigured()) return null;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email) return null;
      return {
        sub: p.sub,
        email: p.email,
        emailVerified: p.email_verified === true,
        name: p.name ?? null,
      };
    } catch {
      return null;
    }
  }
}
