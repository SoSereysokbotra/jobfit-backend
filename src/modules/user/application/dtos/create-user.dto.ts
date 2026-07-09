// src/modules/user/application/dtos/create-user.dto.ts
//
// NOTE: the docs' CreateUserDto includes `supabaseId` (Supabase Auth). This project uses
// self-managed JWT auth and the `users` table has no such column, so it is omitted here.

import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@shared/kernel/enums/user-role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'jane@example.com', format: 'email' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.JOB_SEEKER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
