// src/modules/auth/application/commands/verify-email.command.ts
export class VerifyEmailCommand {
  constructor(
    public readonly email: string, // from registration_verification cookie
    public readonly code: string,
  ) {}
}
