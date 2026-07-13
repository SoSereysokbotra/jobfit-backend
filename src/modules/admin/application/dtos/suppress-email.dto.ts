// src/modules/admin/application/dtos/suppress-email.dto.ts
//
// Body for POST /admin/email/suppress (Feature 3 — suppress a bad address so the
// platform stops sending to it).

import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuppressEmailDto {
  @ApiProperty({ example: 'john@oldjob.com', format: 'email' })
  @IsEmail()
  email: string;
}
