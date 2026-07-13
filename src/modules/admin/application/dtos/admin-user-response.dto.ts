// src/modules/admin/application/dtos/admin-user-response.dto.ts
//
// Read models returned by the User Management endpoints. These never expose secrets
// (passwordHash, verification/reset codes) — only the fields an admin needs.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminUserListItemDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['JOB_SEEKER', 'EMPLOYER', 'ADMIN'] }) role: string;
  @ApiProperty() isActive: boolean;
  @ApiProperty() emailVerified: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) lastLogin: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional({ type: String, nullable: true }) deletedAt: Date | null;

  constructor(row: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    emailVerified: boolean;
    lastLogin: Date | null;
    createdAt: Date;
    deletedAt: Date | null;
  }) {
    this.id = row.id;
    this.email = row.email;
    this.name = row.name;
    this.role = row.role;
    this.isActive = row.isActive;
    this.emailVerified = row.emailVerified;
    this.lastLogin = row.lastLogin;
    this.createdAt = row.createdAt;
    this.deletedAt = row.deletedAt;
  }
}

export class AdminUserDetailDto extends AdminUserListItemDto {
  @ApiProperty({
    description: 'Number of applications this user has submitted.',
  })
  applicationsCount: number;

  @ApiProperty({ description: 'Number of resumes this user has uploaded.' })
  resumesCount: number;

  @ApiProperty({
    description: 'Whether the account is currently locked out (brute-force).',
  })
  isLocked: boolean;

  constructor(
    row: ConstructorParameters<typeof AdminUserListItemDto>[0],
    extra: {
      applicationsCount: number;
      resumesCount: number;
      isLocked: boolean;
    },
  ) {
    super(row);
    this.applicationsCount = extra.applicationsCount;
    this.resumesCount = extra.resumesCount;
    this.isLocked = extra.isLocked;
  }
}
