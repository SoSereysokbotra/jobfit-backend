// src/modules/auth/application/commands/resend-password-reset-verification.command.ts
export class ResendPasswordResetVerificationCommand {
  constructor(public readonly email: string) {}
}
