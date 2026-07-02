import { SetMetadata } from '@nestjs/common';

export type AppRole = 'job_seeker' | 'employer' | 'admin';

export const ROLES_KEY = 'roles';

/**
 * @Roles(...roles) — restricts a route to users with the specified app roles.
 * Works in tandem with RolesGuard which reads from the JWT app_metadata.role claim.
 *
 * Usage:
 *   @Roles('employer')
 *   @Post('jobs')
 *   createJob(...) { ... }
 */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
