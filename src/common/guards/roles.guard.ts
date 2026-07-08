// src/common/guards/roles.guard.ts
//
// Generic RBAC guard. Reads the roles required by @Roles(...) and compares them to
// the roles carried on request.user. It does not authenticate — it assumes some
// upstream guard already populated request.user — so it works with any user shape
// that exposes `roles: string[]` or a single `role: string`.

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() metadata -> route is not role-restricted.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const userRoles: string[] = Array.isArray(user?.roles)
      ? user.roles
      : user?.role
        ? [user.role]
        : [];

    return requiredRoles.some((role) => userRoles.includes(role));
  }
}
