// src/modules/auth/application/dtos/verify-email.dto.ts
// The email is read from the `registration_verification` httpOnly cookie, not the body.
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    example: '123456',
    pattern: '^\\d{6}$',
    description: '6-digit verification code emailed on registration.',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code: string;
}
