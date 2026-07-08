// src/modules/auth/application/dtos/login.dto.ts
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'jane@example.com', format: 'email' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3curePass' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
