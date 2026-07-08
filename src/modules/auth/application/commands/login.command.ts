// src/modules/auth/application/commands/login.command.ts
export class LoginCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly ipAddress: string, // for IP-based lockout
  ) {}
}
