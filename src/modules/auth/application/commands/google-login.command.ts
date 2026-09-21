// src/modules/auth/application/commands/google-login.command.ts
export class GoogleLoginCommand {
  constructor(
    /** The ID token the Google Identity Services button handed the browser. */
    public readonly idToken: string,
    /** Originating IP — the security event and, on first sign-in, the consent record. */
    public readonly ipAddress: string,
  ) {}
}
