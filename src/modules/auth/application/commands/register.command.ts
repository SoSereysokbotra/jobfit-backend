// src/modules/auth/application/commands/register.command.ts
export class RegisterCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    // Optional — Flow 0 signup does not collect a name; it is set during onboarding.
    public readonly name?: string,
  ) {}
}
