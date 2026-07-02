import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { SupabaseJwtPayload } from '@infra/supabase/supabase-auth.service';

/**
 * @CurrentUser() — extracts the verified Supabase JWT payload attached by SupabaseAuthGuard.
 *
 * Usage:
 *   @Get('me')
 *   getMe(@CurrentUser() user: SupabaseJwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SupabaseJwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user: SupabaseJwtPayload }>();
    return request.user;
  },
);
