// src/modules/auth/application/commands/refresh-token.command.ts
export class RefreshTokenCommand {
  constructor(public readonly refreshToken: string) {} // raw token from httpOnly cookie
}
