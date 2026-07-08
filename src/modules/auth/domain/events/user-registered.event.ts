// src/modules/auth/domain/events/user-registered.event.ts
//
// Emitted after Flow 1 (Register). A handler sends the verification email.

export class UserRegisteredEvent {
  static readonly eventName = 'auth.user.registered';

  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly name: string,
    public readonly verificationCode: string,
  ) {}
}
