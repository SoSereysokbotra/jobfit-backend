// src/modules/user/application/dtos/create-user.dto.ts
//
// NOTE: the docs' CreateUserDto includes `supabaseId` (Supabase Auth). This project uses
// self-managed JWT auth and the `users` table has no such column, so it is omitted here.
//
// NO `role` FIELD, deliberately (MENTOR_REVIEW_2026-08-18 §3). It used to accept an
// optional UserRole including ADMIN, which made "create an ADMIN at an address I control,
// then claim it via forgot-password" a working privilege escalation once email delivery
// was fixed (§1). Role assignment is an admin action that should carry an audit row, not
// a request body field, and nothing needs it here: EMPLOYER and ADMIN accounts are
// created by `prisma/seed.ts` with a real password and a verified email, which is more
// than this route can produce. Users created here are JOB_SEEKER, the User aggregate's
// default.

import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'jane@example.com', format: 'email' })
  @IsEmail()
  email: string;
}
