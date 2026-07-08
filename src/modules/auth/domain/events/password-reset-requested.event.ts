// src/modules/auth/domain/events/password-reset-requested.event.ts
//
// Emitted at Flow 6a (Request password reset). A handler emails the reset code.

export class PasswordResetRequestedEvent {
  static readonly eventName = 'auth.password-reset.requested';

  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly resetCode: string,
  ) {}
}
