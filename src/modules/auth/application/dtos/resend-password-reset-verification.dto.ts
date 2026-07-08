// src/modules/auth/application/dtos/resend-password-reset-verification.dto.ts
import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendPasswordResetVerificationDto {
  @ApiProperty({ example: 'jane@example.com', format: 'email' })
  @IsEmail()
  email: string;
}
