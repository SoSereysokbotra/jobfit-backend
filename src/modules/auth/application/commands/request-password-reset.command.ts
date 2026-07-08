// src/modules/auth/application/commands/request-password-reset.command.ts
export class RequestPasswordResetCommand {
  constructor(public readonly email: string) {}
}
