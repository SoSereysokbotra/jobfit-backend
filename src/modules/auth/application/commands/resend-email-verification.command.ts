// src/modules/auth/application/commands/resend-email-verification.command.ts
export class ResendEmailVerificationCommand {
  constructor(public readonly email: string) {}
}
