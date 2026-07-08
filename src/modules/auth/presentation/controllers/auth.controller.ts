// src/modules/auth/presentation/controllers/auth.controller.ts
//
// AUTH-SPEC.md routes. Each route:
//   - opts into exactly one named throttler via @RateLimit (ThrottlerGuard at class level),
//   - dispatches a CQRS command,
//   - manages the flow's httpOnly cookies (httpOnly + sameSite:strict + secure-in-prod).
// Domain errors thrown by handlers are mapped to HTTP by AuthExceptionFilter.
// Fully documented with @nestjs/swagger (see /api/docs).

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, SkipThrottle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RateLimit } from '../../../../common/decorators/rate-limit.decorator';
import { Public } from '../../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { buildAuthCookieOptions } from '../../../../common/utils/cookie.util';
import { THROTTLERS } from '../../../../config/throttler.config';
import { AuthExceptionFilter } from '../exception-filters/auth-exception.filter';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../../domain/repositories/user.repository.interface';

import {
  PASSWORD_RESET_CODE_TTL_MINUTES,
  REFRESH_TOKEN_TTL_SECONDS,
  VERIFICATION_CODE_TTL_MINUTES,
} from '../../application/auth.constants';
import { InvalidRefreshTokenError } from '../../application/errors/auth.errors';

import { RegisterCommand } from '../../application/commands/register.command';
import { VerifyEmailCommand } from '../../application/commands/verify-email.command';
import { ResendEmailVerificationCommand } from '../../application/commands/resend-email-verification.command';
import { RequestPasswordResetCommand } from '../../application/commands/request-password-reset.command';
import { VerifyPasswordResetCommand } from '../../application/commands/verify-password-reset.command';
import { ResetPasswordCommand } from '../../application/commands/reset-password.command';
import { ResendPasswordResetVerificationCommand } from '../../application/commands/resend-password-reset-verification.command';
import { LoginCommand } from '../../application/commands/login.command';
import { RefreshTokenCommand } from '../../application/commands/refresh-token.command';
import { LogoutCommand } from '../../application/commands/logout.command';
import { LoginResult } from '../../application/commands/login.handler';
import { RefreshResult } from '../../application/commands/refresh-token.handler';

import { RegisterDto } from '../../application/dtos/register.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
import { ResendEmailVerificationDto } from '../../application/dtos/resend-email-verification.dto';
import { RequestPasswordResetDto } from '../../application/dtos/request-password-reset.dto';
import { VerifyPasswordResetDto } from '../../application/dtos/verify-password-reset.dto';
import { ResetPasswordDto } from '../../application/dtos/reset-password.dto';
import { ResendPasswordResetVerificationDto } from '../../application/dtos/resend-password-reset-verification.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import {
  AuthResponseDto,
  MessageResponseDto,
} from '../../application/dtos/auth-response.dto';

const COOKIE = {
  registrationVerification: 'registration_verification',
  passwordResetVerification: 'password_reset_verification',
  passwordResetSession: 'password_reset_session',
  refreshToken: 'refresh_token',
} as const;

const encodeEmail = (email: string): string =>
  Buffer.from(email, 'utf8').toString('base64');
const decodeEmail = (b64: string): string =>
  Buffer.from(b64, 'base64').toString('utf8');

const MINUTE_MS = 60 * 1000;

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
@UseFilters(AuthExceptionFilter)
export class AuthController {
  private readonly nodeEnv?: string;

  constructor(
    private readonly commandBus: CommandBus,
    private readonly config: ConfigService,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
  ) {
    this.nodeEnv = this.config.get<string>('NODE_ENV');
  }

  // ---- Flow 1: Registration ----
  @Post('register')
  @Public()
  @RateLimit(THROTTLERS.register.name)
  @HttpCode(201)
  @ApiOperation({
    summary: 'Register a new account',
    description:
      'Creates a new account (or re-registers an unverified one), emails a 6-digit ' +
      'verification code, and sets the `registration_verification` cookie.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    description: 'Registered; verification code sent.',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Weak password or validation error.' })
  @ApiResponse({
    status: 409,
    description: 'An account with this email already exists and is verified.',
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = (await this.commandBus.execute(
      new RegisterCommand(dto.email, dto.password, dto.name),
    )) as { email: string };
    // base64(email) so verify-email knows whose account without a body field.
    this.setCookie(
      res,
      COOKIE.registrationVerification,
      encodeEmail(result.email),
      VERIFICATION_CODE_TTL_MINUTES * MINUTE_MS,
    );
    return { message: 'Registration successful. Check your email for a code.' };
  }

  // ---- Flow 2: Email verification ----
  @Post('verify-email')
  @Public()
  @RateLimit(THROTTLERS.verifyCode.name)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verify email address',
    description:
      'Reads the email from the `registration_verification` cookie and validates the ' +
      '6-digit code.',
  })
  @ApiBody({ type: VerifyEmailDto })
  @ApiOkResponse({ description: 'Email verified.', type: MessageResponseDto })
  @ApiResponse({ status: 400, description: 'Code expired or no verification session.' })
  @ApiResponse({ status: 401, description: 'Invalid code.' })
  @ApiResponse({ status: 409, description: 'Email already verified.' })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = this.readEmailCookie(req, COOKIE.registrationVerification);
    await this.commandBus.execute(new VerifyEmailCommand(email, dto.code));
    this.clearCookie(res, COOKIE.registrationVerification);
    return { success: true };
  }

  @Post('resend-email-verification')
  @Public()
  @RateLimit(THROTTLERS.resend.name)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Resend email verification code',
    description: 'Always returns success (email-enumeration protection).',
  })
  @ApiBody({ type: ResendEmailVerificationDto })
  @ApiOkResponse({ type: MessageResponseDto })
  async resendEmailVerification(
    @Body() dto: ResendEmailVerificationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.commandBus.execute(
      new ResendEmailVerificationCommand(dto.email),
    );
    // Refresh the cookie (always — success regardless of whether the email exists).
    this.setCookie(
      res,
      COOKIE.registrationVerification,
      encodeEmail(dto.email),
      VERIFICATION_CODE_TTL_MINUTES * MINUTE_MS,
    );
    return { success: true };
  }

  // ---- Flow 3: Password reset (3 steps) ----
  @Post('request-password-reset')
  @Public()
  @RateLimit(THROTTLERS.passwordReset.name)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request a password reset code',
    description: 'Always returns success regardless of whether the email exists.',
  })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiOkResponse({ type: MessageResponseDto })
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.commandBus.execute(new RequestPasswordResetCommand(dto.email));
    this.setCookie(
      res,
      COOKIE.passwordResetVerification,
      encodeEmail(dto.email),
      PASSWORD_RESET_CODE_TTL_MINUTES * MINUTE_MS,
    );
    return { success: true };
  }

  @Post('verify-password-reset')
  @Public()
  @RateLimit(THROTTLERS.verifyCode.name)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verify password reset code',
    description:
      'Reads the `password_reset_verification` cookie; on success clears it and issues ' +
      'the short-lived `password_reset_session` cookie.',
  })
  @ApiBody({ type: VerifyPasswordResetDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiResponse({ status: 400, description: 'Code expired or no session.' })
  @ApiResponse({ status: 401, description: 'Invalid code.' })
  async verifyPasswordReset(
    @Body() dto: VerifyPasswordResetDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = this.readEmailCookie(req, COOKIE.passwordResetVerification);
    await this.commandBus.execute(new VerifyPasswordResetCommand(email, dto.code));
    // Swap: clear the verification cookie, issue the short-lived reset session.
    this.clearCookie(res, COOKIE.passwordResetVerification);
    this.setCookie(
      res,
      COOKIE.passwordResetSession,
      encodeEmail(email),
      PASSWORD_RESET_CODE_TTL_MINUTES * MINUTE_MS,
    );
    return { success: true };
  }

  @Post('reset-password')
  @Public()
  @RateLimit(THROTTLERS.passwordReset.name)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reset password',
    description:
      'Reads the `password_reset_session` cookie, sets the new password, and revokes ' +
      'ALL of the user\'s refresh tokens.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiResponse({ status: 400, description: 'Weak password or no reset session.' })
  @ApiResponse({ status: 401, description: 'Reset session invalid.' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = this.readEmailCookie(req, COOKIE.passwordResetSession);
    await this.commandBus.execute(new ResetPasswordCommand(email, dto.password));
    this.clearCookie(res, COOKIE.passwordResetSession);
    return { success: true };
  }

  @Post('resend-password-reset-verification')
  @Public()
  @RateLimit(THROTTLERS.resend.name)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Resend password reset code',
    description: 'Always returns success (email-enumeration protection).',
  })
  @ApiBody({ type: ResendPasswordResetVerificationDto })
  @ApiOkResponse({ type: MessageResponseDto })
  async resendPasswordResetVerification(
    @Body() dto: ResendPasswordResetVerificationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.commandBus.execute(
      new ResendPasswordResetVerificationCommand(dto.email),
    );
    this.setCookie(
      res,
      COOKIE.passwordResetVerification,
      encodeEmail(dto.email),
      PASSWORD_RESET_CODE_TTL_MINUTES * MINUTE_MS,
    );
    return { success: true };
  }

  // ---- Flow 4: Login ----
  @Post('login')
  @Public()
  @RateLimit(THROTTLERS.login.name)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Log in',
    description:
      'Returns an access token in the body and sets the `refresh_token` httpOnly cookie. ' +
      'The refresh token is never returned in the body.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Authenticated.', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @ApiResponse({ status: 403, description: 'Email not verified.' })
  @ApiResponse({ status: 429, description: 'Account or IP is locked out.' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = (await this.commandBus.execute(
      new LoginCommand(dto.email, dto.password, req.ip ?? ''),
    )) as LoginResult;
    // Refresh token -> httpOnly cookie only. Access token -> body only.
    this.setCookie(
      res,
      COOKIE.refreshToken,
      result.refreshToken,
      REFRESH_TOKEN_TTL_SECONDS * 1000,
    );
    return { accessToken: result.accessToken };
  }

  // ---- Flow 5: Refresh (rotation) ----
  @Post('refresh-token')
  @Public()
  @RateLimit(THROTTLERS.refreshToken.name)
  @HttpCode(200)
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Refresh tokens (single-use rotation)',
    description:
      'Reads the `refresh_token` cookie, rotates it (the old one is single-use), returns ' +
      'a new access token and replaces the cookie. Replaying a spent token returns 401 ' +
      'and revokes all of the user\'s sessions (theft detection).',
  })
  @ApiOkResponse({ description: 'Rotated.', type: AuthResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Missing, invalid, expired, or reused refresh token.',
  })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = this.cookie(req, COOKIE.refreshToken);
    if (!raw) throw new InvalidRefreshTokenError();
    try {
      const result = (await this.commandBus.execute(
        new RefreshTokenCommand(raw),
      )) as RefreshResult;
      this.setCookie(
        res,
        COOKIE.refreshToken,
        result.refreshToken,
        REFRESH_TOKEN_TTL_SECONDS * 1000,
      );
      return { accessToken: result.accessToken };
    } catch (err) {
      // On any refresh failure (invalid / reused / dead session) clear the stale cookie
      // so the client is forced to re-login.
      this.clearCookie(res, COOKIE.refreshToken);
      throw err;
    }
  }

  // ---- Flow 6: Logout (requires a valid access token) ----
  @Post('logout')
  @RateLimit(THROTTLERS.logout.name)
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Log out',
    description:
      'Requires a valid access token. Deletes the current refresh token and blacklists ' +
      'the access token\'s jti for its remaining lifetime.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token.' })
  async logout(
    @Req() req: Request,
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.cookie(req, COOKIE.refreshToken);
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    await this.commandBus.execute(new LogoutCommand(refreshToken, accessToken));
    this.clearCookie(res, COOKIE.refreshToken);
    return { success: true };
  }

  // ---- Current user (requires a valid access token) ----
  @Get('me')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get the current authenticated user',
    description: 'Returns the safe (secret-free) profile of the logged-in user.',
  })
  @ApiOkResponse({ description: 'The current user.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token.' })
  async me(@CurrentUser('id') userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new UnauthorizedException('User no longer exists');
    return user.toSafe();
  }

  // ----- helpers -----

  private cookie(req: Request, name: string): string | undefined {
    return (req as Request & { cookies?: Record<string, string> }).cookies?.[
      name
    ];
  }

  private readEmailCookie(req: Request, name: string): string {
    const raw = this.cookie(req, name);
    if (!raw) {
      throw new BadRequestException(
        'No verification session in progress. Please restart the flow.',
      );
    }
    return decodeEmail(raw);
  }

  private setCookie(
    res: Response,
    name: string,
    value: string,
    maxAgeMs?: number,
  ): void {
    res.cookie(name, value, buildAuthCookieOptions(this.nodeEnv, maxAgeMs));
  }

  private clearCookie(res: Response, name: string): void {
    res.clearCookie(name, buildAuthCookieOptions(this.nodeEnv));
  }
}
