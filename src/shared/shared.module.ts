// src/shared/shared.module.ts
//
// Providers/exports match NESTJS-DDD-PROJECT-STRUCTURE.md (§ SHARED MODULE).
// RECONCILIATION: that doc's SharedModule imports no JwtModule, but its JwtService
// injects NestJwtService — which is only provided by JwtModule. So JwtModule.registerAsync
// is added here (as shown in NESTJS-QUICK-START-GUIDE.md's SharedModule) so the module
// actually resolves and boots. JwtModule is also re-exported for downstream modules.

import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './services/prisma.service';
import { JwtService } from './services/jwt.service';
import { EmailService } from './services/email.service';
import { LoggerService } from './services/logger.service';
import { RedisService } from './services/redis.service';

// Global so the app-wide JwtAuthGuard (and any feature controller that references it via
// @UseGuards(JwtAuthGuard)) can inject JwtService without each module re-importing this.
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [PrismaService, JwtService, EmailService, LoggerService, RedisService],
  exports: [
    PrismaService,
    JwtService,
    EmailService,
    LoggerService,
    RedisService,
    JwtModule,
  ],
})
export class SharedModule {}
