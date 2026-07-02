import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SupabaseAuthService } from '@infra/supabase/supabase-auth.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip guard for routes decorated with @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user: unknown }>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('No authorization token provided');
    }

    // Verify locally — no round-trip to Supabase
    const payload = this.supabaseAuth.verifyToken(token);
    request.user = payload;

    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7);
  }
}
