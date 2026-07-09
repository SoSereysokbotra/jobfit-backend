// src/modules/user/domain/entities/user.entity.ts
//
// User aggregate root (Phase 3, User module).
//
// NOTE: the docs' User carries a `supabaseId` (Supabase Auth linkage). This project uses
// SELF-MANAGED JWT auth (Phase 1 decision) and the `users` table has no `supabaseId`
// column, so it is intentionally omitted here. Identity + credentials live in the auth
// module; this aggregate models the user's role and subscription concerns.

import { AggregateRoot } from '@common/abstracts/aggregate-root';
import { UserRole } from '@shared/kernel/enums/user-role.enum';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';
import { UserCreatedEvent } from '../events/user-created.event';

/** Props accepted when constructing / rehydrating a User. */
export interface UserProps {
  email: string;
  role?: UserRole;
  subscriptionTier?: SubscriptionTier;
  createdAt?: Date;
  updatedAt?: Date;
}

export class User extends AggregateRoot {
  email: string;
  role: UserRole;
  subscriptionTier: SubscriptionTier;

  /**
   * Construct a User. Prefer {@link User.create} for brand-new users (it raises the
   * creation event); use the constructor directly when rehydrating from persistence
   * (pass the existing `id`).
   */
  constructor(props: UserProps, id?: string) {
    super(props, id);
    this.email = props.email;
    this.role = props.role ?? UserRole.JOB_SEEKER;
    this.subscriptionTier = props.subscriptionTier ?? SubscriptionTier.FREE;
  }

  /**
   * Factory for a new User. Defaults role to JOB_SEEKER, subscription to FREE, and raises
   * a {@link UserCreatedEvent}.
   */
  static create(props: { email: string; role?: UserRole }): User {
    const user = new User(props);
    user.addDomainEvent(new UserCreatedEvent(user.id, user.email));
    return user;
  }

  /** Change the subscription tier (FREE | PREMIUM | PROFESSIONAL). */
  upgradeSubscription(tier: SubscriptionTier): void {
    this.subscriptionTier = tier;
    this.updatedAt = new Date();
  }

  /** Change the user's role (JOB_SEEKER | EMPLOYER | ADMIN). */
  changeRole(role: UserRole): void {
    this.role = role;
    this.updatedAt = new Date();
  }
}
