// src/modules/auth/application/commands/logout.command.ts
export class LogoutCommand {
  constructor(
    public readonly refreshToken: string | undefined, // from refresh_token cookie
    public readonly accessToken: string | undefined, // from Authorization header
  ) {}
}
