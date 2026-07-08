// src/modules/auth/application/dtos/request-password-reset.dto.ts
import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'jane@example.com', format: 'email' })
  @IsEmail()
  email: string;
}
