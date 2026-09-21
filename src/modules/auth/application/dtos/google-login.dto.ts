// src/modules/auth/application/dtos/google-login.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description:
      'The ID token (a JWT) that Google Identity Services returns to the browser as ' +
      '`credential`. Verified server-side against GOOGLE_CLIENT_ID; never trusted as-is.',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
  })
  @IsString()
  @IsNotEmpty()
  // Google ID tokens are ~1 KB. A bound stops the endpoint being a free place to park
  // arbitrary bytes for the verifier to chew on.
  @MaxLength(4096)
  idToken: string;
}
