// src/modules/auth/domain/services/iaccount-lockout.service.interface.ts
//
// Domain port for brute-force lockout. The infra AccountLockoutService (Redis)
// implements it. Declared here so the application layer depends on the abstraction.
// NOTE: this is a *port* — AuthDomainService itself stays pure and does NOT use it.

export interface IAccountLockoutService {
  recordFailedAttempt(email: string, ip: string): Promise<void>;
  isLocked(email: string, ip: string): Promise<boolean>;
  clearAttempts(email: string): Promise<void>;
}

export const ACCOUNT_LOCKOUT_SERVICE = Symbol('IAccountLockoutService');
