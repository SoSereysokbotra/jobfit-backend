// src/modules/admin/application/dtos/suppress-email.dto.ts
//
// Body for POST /admin/email/suppress (Feature 3 — suppress a bad address so the
// platform stops sending to it).

import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuppressEmailDto {
  @ApiProperty({ example: 'john@oldjob.com', format: 'email' })
  @IsEmail()
  email: string;

  /**
   * Why. Stored on the suppression record, which is a permanent compliance record —
   * "hard bounce" and "spam complaint" answer very different questions six months later
   * when someone asks why we stopped mailing an address.
   */
  @ApiPropertyOptional({ example: 'hard bounce', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
