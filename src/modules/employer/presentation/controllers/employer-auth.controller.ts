// src/modules/employer/presentation/controllers/employer-auth.controller.ts
//
// The employer portal's own sign-in, separate from the seeker one (employer_logic.md v2.1
// §5.1). Structurally identical to AdminAuthController: @Public() login, refresh token
// delivered only as an httpOnly cookie, access token in the body.

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
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';

import { Public } from '@common/decorators/public.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { buildAuthCookieOptions } from '@common/utils/cookie.util';
import { REFRESH_TOKEN_TTL_SECONDS } from '@modules/auth/application/auth.constants';
import { EmployerAuthService } from '../../application/services/employer-auth.service';

const REFRESH_COOKIE = 'refresh_token';

export class EmployerLoginDto {
  @ApiProperty({ example: 'recruiting@techcorp.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3curePass' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}

export class EmployerLoginResponseDto {
  @ApiProperty() accessToken: string;
  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }
}

export class EmployerAuthMessageDto {
  @ApiProperty() message: string;
  constructor(message: string) {
    this.message = message;
  }
}

@ApiTags('Employer - Auth')
@Controller('employer/auth')
export class EmployerAuthController {
  private readonly nodeEnv?: string;

  constructor(
    private readonly employerAuth: EmployerAuthService,
    private readonly config: ConfigService,
  ) {
    this.nodeEnv = this.config.get<string>('NODE_ENV');
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Employer login',
    description:
      'Authenticates an employer. Returns an access token and sets the refresh_token ' +
      'cookie. A job seeker or admin account is rejected with 403 and told which portal ' +
      'to use. An account that has been approved but never activated cannot sign in here: ' +
      'it is unverified with no password, and the login command refuses unverified ' +
      'accounts.',
  })
  @ApiOkResponse({ type: EmployerLoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials, or not yet activated.' })
  @ApiResponse({ status: 403, description: 'Account is not an employer.' })
  async login(
    @Body() dto: EmployerLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EmployerLoginResponseDto> {
    const result = await this.employerAuth.login(
      dto.email,
      dto.password,
      req.ip ?? '',
    );
    res.cookie(
      REFRESH_COOKIE,
      result.refreshToken,
      buildAuthCookieOptions(this.nodeEnv, REFRESH_TOKEN_TTL_SECONDS * 1000),
    );
    return new EmployerLoginResponseDto(result.accessToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Employer logout' })
  @ApiOkResponse({ type: EmployerAuthMessageDto })
  async logout(
    @Req() req: Request,
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EmployerAuthMessageDto> {
    const refreshToken = (req as Request & { cookies?: Record<string, string> })
      .cookies?.[REFRESH_COOKIE];
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    await this.employerAuth.logout(refreshToken, accessToken);
    res.clearCookie(REFRESH_COOKIE, buildAuthCookieOptions(this.nodeEnv));
    return new EmployerAuthMessageDto('Logged out.');
  }
}
