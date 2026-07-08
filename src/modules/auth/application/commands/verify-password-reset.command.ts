// src/modules/auth/application/commands/verify-password-reset.command.ts
export class VerifyPasswordResetCommand {
  constructor(
    public readonly email: string, // from password_reset_verification cookie
    public readonly code: string,
  ) {}
}
