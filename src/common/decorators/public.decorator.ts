// src/common/decorators/public.decorator.ts
//
// Marks a route (or whole controller) as public so the globally-registered JwtAuthGuard
// lets it through without a token. Read by JwtAuthGuard via Reflector.
//
//   @Public()
//   @Post('login')
//   login() { ... }

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
