// src/modules/user/presentation/controllers/user.controller.ts
//
// User management endpoints. Returns UserResponseDto (never the domain entity).
//
// AUTH NOTE: the docs' controller uses @UseGuards(SupabaseAuthGuard), but this project is
// self-managed JWT (app-JWT canonical) and JwtAuthGuard is registered GLOBALLY (APP_GUARD,
// secure-by-default). So every route here already requires a JWT unless marked @Public().
//
// AUTHORIZATION — read this before adding a route. The global guards are secure-by-default
// for AUTHENTICATION only: JwtAuthGuard demands a token, but RolesGuard allows any route
// that carries no @Roles() metadata (roles.guard.ts:23-25). "Logged in" is therefore NOT a
// permission. Every write route below states its own @Roles('ADMIN'); a new route with no
// @Roles() is open to every authenticated user, which is how
// `PATCH /users/:id/subscription` once let any user grant themselves PROFESSIONAL
// (MENTOR_REVIEW_2026-08-18 §2).
//
// There is deliberately NO `DELETE /users/:id` here. Account deletion lives only on
// `DELETE /admin/users/:id`, which writes a USER_ACCOUNT_DELETED audit row
// (admin-user.service.ts:111-120). A second, unaudited delete path is what HANDOFF §6
// blames for a user row vanishing with 50 hand-labelled eval pairs — so the fix is one
// audited path, not two gated ones.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';
import { ERROR_MESSAGES } from '@common/constants/error-messages';
import { UserService } from '../../application/services/user.service';
import { CreateUserDto } from '../../application/dtos/create-user.dto';
import { UserResponseDto } from '../../application/dtos/user-response.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ADMIN-only: this creates a row with an empty passwordHash and an attacker-settable
  // role. Self-signup is POST /auth/register, which hashes a password and requires email
  // verification. (The `role` field on CreateUserDto is MENTOR_REVIEW §3's problem.)
  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user (admin only)' })
  @ApiForbiddenResponse({ description: 'Caller is not an ADMIN.' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.userService.createUser(dto);
    return new UserResponseDto(user);
  }

  // Declared before ':id' so the two-segment path is matched explicitly.
  @Get('email/:email')
  @Public()
  @ApiOperation({ summary: 'Get a user by email (public)' })
  async getByEmail(
    @Param('email') email: string,
  ): Promise<UserResponseDto> {
    const user = await this.userService.getUserByEmail(email);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    return new UserResponseDto(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  async getById(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.userService.getUserById(id); // throws NotFound if absent
    return new UserResponseDto(user);
  }

  // ADMIN-only: an unfiltered roster of every account. GET /admin/users is the richer,
  // searchable equivalent.
  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List users, paginated (admin only)' })
  @ApiForbiddenResponse({ description: 'Caller is not an ADMIN.' })
  async list(
    @Query('skip') skip = '0',
    @Query('take') take = '20',
  ): Promise<UserResponseDto[]> {
    const skipNum = parseInt(skip, 10) || 0;
    const takeNum = Math.min(parseInt(take, 10) || 20, 100);
    const users = await this.userService.getAll(skipNum, takeNum);
    return users.map((user) => new UserResponseDto(user));
  }

  // ADMIN-only. This is the value the paywall reads
  // (generation.controller.ts:126-136, resume.controller.ts:224-228), so a caller who can
  // set it can unlock every paid feature for free. It must never be reachable by the user
  // it describes: an id in the URL plus "is logged in" is not a permission.
  //
  // Manual grants and support fixes only — a real purchase should move the tier through
  // the payment module, not here.
  @Patch(':id/subscription')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Change a user subscription tier (admin only)' })
  @ApiForbiddenResponse({ description: 'Caller is not an ADMIN.' })
  async updateSubscription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tier') tier: SubscriptionTier,
  ): Promise<UserResponseDto> {
    if (!Object.values(SubscriptionTier).includes(tier)) {
      throw new BadRequestException('Invalid subscription tier');
    }
    const user = await this.userService.upgradeSubscription(id, tier);
    return new UserResponseDto(user);
  }
}
