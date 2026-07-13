// src/modules/admin/presentation/controllers/admin-auth.controller.ts
//
// Admin authentication endpoints (Admin Authentication — simplified). Reuses the auth
// module's login/logout flows through AdminAuthService and enforces the ADMIN role.
// The refresh token is delivered only as an httpOnly cookie (never in the body); the
// access token is returned in the body — identical to the main auth controller.

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Public } from '@common/decorators/public.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { buildAuthCookieOptions } from '@common/utils/cookie.util';
import { REFRESH_TOKEN_TTL_SECONDS } from '@modules/auth/application/auth.constants';
import { AdminAuthService } from '../../application/services/admin-auth.service';
import { AdminLoginDto } from '../../application/dtos/admin-login.dto';
import {
  AdminLoginResponseDto,
  AdminMessageResponseDto,
} from '../../application/dtos/admin-message-response.dto';

const REFRESH_COOKIE = 'refresh_token';

@ApiTags('Admin - Auth')
@Controller('admin')
export class AdminAuthController {
  private readonly nodeEnv?: string;

  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly config: ConfigService,
  ) {
    this.nodeEnv = this.config.get<string>('NODE_ENV');
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin login',
    description:
      'Authenticates an admin. Returns an access token and sets the refresh_token cookie. ' +
      'Non-admin accounts are rejected with 403.',
  })
  @ApiOkResponse({ type: AdminLoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @ApiResponse({ status: 403, description: 'Account is not an admin.' })
  async login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminLoginResponseDto> {
    const result = await this.adminAuth.login(
      dto.email,
      dto.password,
      req.ip ?? '',
    );
    res.cookie(
      REFRESH_COOKIE,
      result.refreshToken,
      buildAuthCookieOptions(this.nodeEnv, REFRESH_TOKEN_TTL_SECONDS * 1000),
    );
    return new AdminLoginResponseDto(result.accessToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin logout',
    description:
      'Revokes the refresh token and blacklists the current access token for its ' +
      'remaining lifetime.',
  })
  @ApiOkResponse({ type: AdminMessageResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token.' })
  async logout(
    @Req() req: Request,
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminMessageResponseDto> {
    const refreshToken = (req as Request & { cookies?: Record<string, string> })
      .cookies?.[REFRESH_COOKIE];
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    await this.adminAuth.logout(refreshToken, accessToken);
    res.clearCookie(REFRESH_COOKIE, buildAuthCookieOptions(this.nodeEnv));
    return new AdminMessageResponseDto('Logged out.');
  }
}
