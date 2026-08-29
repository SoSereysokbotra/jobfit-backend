// src/modules/admin/application/dtos/set-user-status.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetUserStatusDto {
  @ApiProperty({
    enum: UserStatus,
    description:
      'ACTIVE reinstates the account. SUSPENDED is a reversible stop. DEACTIVATED is a ' +
      'permanent close — though still reversible here, because deletedAt is the genuinely ' +
      'terminal state and a misclick should not need a database session to undo.',
  })
  @IsEnum(UserStatus)
  status: UserStatus;
}
