// src/modules/auth/application/dtos/reset-password.dto.ts
// The email is read from the `password_reset_session` httpOnly cookie, not the body.
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'N3wS3curePass',
    minLength: 8,
    maxLength: 72,
    description: 'New password. Min 8 chars, must include upper, lower and a number.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
