import { SetMetadata } from '@nestjs/common';

// App roles for JobFit. These MUST match the Prisma `UserRole` enum values (uppercase),
// because RolesGuard compares them against the `role` claim carried on the JWT, which is
// the DB enum value.
export type AppRole = 'JOB_SEEKER' | 'EMPLOYER' | 'ADMIN';

export const ROLES_KEY = 'roles';

/**
 * @Roles(...roles) — restricts a route to users with the specified app roles.
 * Works in tandem with RolesGuard which reads the `role` claim off request.user
 * (populated by JwtAuthGuard).
 *
 * Usage:
 *   @Roles('EMPLOYER')
 *   @Post('jobs')
 *   createJob(...) { ... }
 */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
