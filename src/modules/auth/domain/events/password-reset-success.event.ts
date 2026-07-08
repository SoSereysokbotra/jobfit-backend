// src/modules/auth/domain/events/password-reset-success.event.ts
//
// Emitted after Flow 6b (Reset password succeeds). A handler can send a confirmation
// email / security alert.

export class PasswordResetSuccessEvent {
  static readonly eventName = 'auth.password-reset.success';

  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {}
}
