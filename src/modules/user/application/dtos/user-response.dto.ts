// src/modules/user/application/dtos/user-response.dto.ts
//
// API response projection of the User aggregate. Built from a domain User entity so
// controllers never leak Prisma models or the aggregate directly.

import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '@shared/kernel/enums/user-role.enum';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: SubscriptionTier })
  subscriptionTier: SubscriptionTier;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(user: User) {
    this.id = user.id;
    this.email = user.email;
    this.role = user.role;
    this.subscriptionTier = user.subscriptionTier;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
  }
}
