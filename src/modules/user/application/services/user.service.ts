// src/modules/user/application/services/user.service.ts
//
// User application service. Orchestrates the User aggregate + repository, and publishes
// the aggregate's domain events via the DomainEventBus after persistence. Returns domain
// entities (never Prisma models).

import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { User } from '../../domain/entities/user.entity';
import { CreateUserDto } from '../dtos/create-user.dto';
import { DomainEventBus } from '@events/domain-event-bus.service';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';
import { ERROR_MESSAGES } from '@common/constants/error-messages';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  /** Create a new user, persist it, and publish its creation event. */
  async createUser(dto: CreateUserDto): Promise<User> {
    const user = User.create({ email: dto.email, role: dto.role });
    await this.userRepository.save(user);
    await this.publishEvents(user);
    return user;
  }

  /** Fetch a user by id. Throws NotFoundException if it does not exist. */
  async getUserById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    return user;
  }

  /** Fetch a user by email, or null if none. */
  async getUserByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  /** List non-deleted users, newest first, paginated. */
  async getAll(skip = 0, take = 20): Promise<User[]> {
    return this.userRepository.findAll(skip, take);
  }

  /** Change a user's subscription tier, persist, and publish any resulting events. */
  async upgradeSubscription(
    userId: string,
    tier: SubscriptionTier,
  ): Promise<User> {
    const user = await this.getUserById(userId);
    user.upgradeSubscription(tier);
    await this.userRepository.save(user);
    await this.publishEvents(user);
    return user;
  }

  // NO deleteUser() here, deliberately. Account deletion goes through
  // AdminUserService.deleteAccount, which is @Roles('ADMIN') and writes a
  // USER_ACCOUNT_DELETED audit row. A convenience wrapper on this service would be a
  // second, unaudited path one @Post() away from being exposed again
  // (MENTOR_REVIEW_2026-08-18 §2). UserRepository.delete is left in place as a repository
  // primitive, but nothing in this module calls it.

  /** Publish and then clear the aggregate's pending domain events. */
  private async publishEvents(user: User): Promise<void> {
    const events = user.getDomainEvents();
    for (const event of events) {
      await this.eventBus.publish(event);
    }
    user.clearDomainEvents();
  }
}
