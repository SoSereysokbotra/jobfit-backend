import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() — marks a route as publicly accessible, bypassing SupabaseAuthGuard.
 *
 * Usage:
 *   @Public()
 *   @Get('health')
 *   healthCheck() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
