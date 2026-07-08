// src/modules/auth/domain/entities/safe-user.entity.ts
//
// Public/safe projection of a user. It deliberately OMITS every secret/sensitive field
// — passwordHash, verificationCode(+expiry), passwordResetCode(+expiry) — so it is safe
// to cache under `cache:user:entity:{userId}` and to return from controllers.
//
// Build one with `userEntity.toSafe()`. (Kept as an interface, not a class importing
// UserEntity, to avoid a circular dependency with user.entity.ts.)

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin: Date | null;
  deletedAt: Date | null;
}
