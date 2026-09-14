// src/modules/auth/application/commands/register.command.ts
export class RegisterCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    // Optional — Flow 0 signup does not collect a name; it is set during onboarding.
    public readonly name?: string,
    /**
     * Originating IP, recorded as part of the terms-acceptance audit trail (D7).
     *
     * Passed from the controller the same way `LoginCommand` takes it. Optional so the
     * many tests that construct this command directly keep compiling; absent simply means
     * the IP was not captured, which the record represents as null rather than "".
     */
    public readonly ipAddress?: string,
  ) {}
}
