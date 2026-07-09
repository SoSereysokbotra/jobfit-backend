// src/common/constants/error-messages.ts
//
// Centralised, reusable error message strings (from QUICK_REFERENCE.md / roadmap).

export const ERROR_MESSAGES = {
  INVALID_EMAIL: 'Email format is invalid',
  INVALID_PASSWORD:
    'Password must be at least 8 characters with uppercase, lowercase, and numbers',
  USER_NOT_FOUND: 'User not found',
  INVALID_CREDENTIALS: 'Invalid email or password',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
} as const;
