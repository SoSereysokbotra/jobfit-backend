// src/modules/auth/application/dtos/register.dto.ts
//
// Flow 0.1 (Email/Password Signup): the signup form collects email, password and the
// "I agree to Terms" checkbox. `name` is NOT collected at signup — it is set later during
// onboarding (Flow 1) — so it is optional here.

import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com', format: 'email' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'S3curePass',
    minLength: 8,
    maxLength: 72,
    description: 'Min 8 chars, must include upper, lower and a number.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt truncates beyond 72 bytes
  password: string;

  @ApiProperty({
    example: true,
    description: 'The user must accept the Terms of Service to register.',
  })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the Terms of Service.' })
  agreeToTerms: boolean;

  @ApiPropertyOptional({ example: 'Jane Doe', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
