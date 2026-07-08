// src/modules/auth/application/commands/reset-password.command.ts
export class ResetPasswordCommand {
  constructor(
    public readonly email: string, // from password_reset_session cookie
    public readonly newPassword: string,
  ) {}
}
