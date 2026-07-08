// src/common/decorators/current-user.decorator.ts
//
// Generic param decorator that pulls the authenticated principal off the request.
// It makes no assumptions about the user shape — it simply returns `request.user`
// (or one property of it) that an auth guard/strategy is expected to populate later.
//
//   @Get() me(@CurrentUser() user) {}
//   @Get() myId(@CurrentUser('id') id: string) {}

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
