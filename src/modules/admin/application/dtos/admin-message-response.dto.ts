// src/modules/admin/application/dtos/admin-message-response.dto.ts
//
// Generic success/acknowledgement payloads used by the admin action endpoints.

import { ApiProperty } from '@nestjs/swagger';

export class AdminMessageResponseDto {
  @ApiProperty({ example: true }) success: boolean;
  @ApiProperty({ example: 'Done.' }) message: string;

  constructor(message: string) {
    this.success = true;
    this.message = message;
  }
}

export class AdminLoginResponseDto {
  @ApiProperty({
    description: 'Short-lived JWT access token (60-min session).',
  })
  accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }
}
