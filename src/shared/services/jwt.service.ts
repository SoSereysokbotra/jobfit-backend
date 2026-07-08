// src/shared/services/jwt.service.ts

import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtService {
  constructor(
    private readonly jwtService: NestJwtService,
    private readonly configService: ConfigService,
  ) {}

  generateToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId },
      {
        expiresIn: '24h',
      },
    );
  }

  generateRefreshToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId },
      {
        expiresIn: '30d',
      },
    );
  }

  verifyToken(token: string): any {
    return this.jwtService.verify(token);
  }
}
