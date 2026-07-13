// src/modules/admin/application/dtos/admin-login.dto.ts
//
// Admin login payload. Mirrors the auth LoginDto but lives in the admin module so the
// admin surface is self-contained. The handler reuses the shared LoginCommand and then
// enforces that the authenticated user has the ADMIN role.

import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@jobfit.com', format: 'email' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3curePass', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
