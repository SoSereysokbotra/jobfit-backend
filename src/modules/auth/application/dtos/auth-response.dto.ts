// src/modules/auth/application/dtos/auth-response.dto.ts
// Response shapes for the auth routes. The refresh token is NEVER in the body — it is
// set as the httpOnly `refresh_token` cookie by the controller.

import { ApiProperty } from '@nestjs/swagger';

/** login / refresh-token success body. */
export class AuthResponseDto {
  @ApiProperty({
    description: 'Short-lived JWT access token. Send as `Authorization: Bearer <token>`.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;
}

/** Generic success body for state-changing routes that return no data. */
export class MessageResponseDto {
  @ApiProperty({ example: true, required: false })
  success?: boolean;

  @ApiProperty({
    example: 'Registration successful. Check your email for a code.',
    required: false,
  })
  message?: string;
}
