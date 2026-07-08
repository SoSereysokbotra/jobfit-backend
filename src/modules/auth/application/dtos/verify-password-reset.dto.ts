// src/modules/auth/application/dtos/verify-password-reset.dto.ts
// The email is read from the `password_reset_verification` httpOnly cookie, not the body.
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyPasswordResetDto {
  @ApiProperty({
    example: '123456',
    pattern: '^\\d{6}$',
    description: '6-digit code emailed by /auth/request-password-reset.',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code: string;
}
