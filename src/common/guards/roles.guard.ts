import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRole, ROLES_KEY } from '../decorators/roles.decorator';
import { SupabaseJwtPayload } from '@infra/supabase/supabase-auth.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator — route is accessible to any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user: SupabaseJwtPayload }>();
    const userRole = request.user?.app_metadata?.role as AppRole | undefined;

    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
