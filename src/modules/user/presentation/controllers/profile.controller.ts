// src/modules/user/presentation/controllers/profile.controller.ts
//
// Profile endpoints. Returns ProfileResponseDto (never the domain entity).
//
// AUTH NOTE: the docs use @UseGuards(SupabaseAuthGuard); this project is self-managed JWT
// (app-JWT canonical) with JwtAuthGuard registered GLOBALLY (secure-by-default), so every
// route requires a JWT. Write routes keep an explicit @UseGuards(JwtAuthGuard) to mirror
// the docs' intent, and enforce "own profile only" by comparing the JWT subject to :userId.
//
// GET /profiles/:userId USED TO BE @Public(). It returns phone, full name, photo, bio,
// location and job preferences, so unauthenticated it was a PII read keyed by user id —
// and until the same day GET /users/email/:email handed those ids out to anyone, making
// email -> id -> phone number a complete anonymous harvest (MENTOR_REVIEW_2026-08-18 §3).
// It is now self-or-admin, the same rule as GET /users/:id.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { assertOwner, assertSelfOrAdmin } from '@common/utils/ownership.util';
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from '@common/guards/jwt-auth.guard';
import { ProfileService } from '../../application/services/profile.service';
import { CreateProfileDto } from '../../application/dtos/create-profile.dto';
import { UpdateProfileDto } from '../../application/dtos/update-profile.dto';
import { ProfileResponseDto } from '../../application/dtos/profile-response.dto';
import { WorkPreferences } from '../../domain/entities/profile.entity';

@ApiTags('Profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create the current user’s profile' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProfileDto,
  ): Promise<ProfileResponseDto> {
    const profile = await this.profileService.createProfile(user.id, dto);
    return new ProfileResponseDto(profile);
  }

  @Get(':userId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a user profile (own, or any as ADMIN)' })
  @ApiForbiddenResponse({
    description: 'Not your profile, and you are not an ADMIN.',
  })
  async getByUserId(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<ProfileResponseDto> {
    assertSelfOrAdmin(caller, userId);
    const profile = await this.profileService.getProfile(userId); // throws NotFound if absent
    return new ProfileResponseDto(profile);
  }

  @Patch(':userId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update own profile',
    description:
      'Requires `expectedUpdatedAt` — the `updatedAt` you last saw. If the profile changed ' +
      'server-side since then the update is refused with 409 and both versions are returned.',
  })
  @ApiConflictResponse({
    description:
      'Version conflict. Body carries { conflict: true, serverVersion, clientAttempted } ' +
      'so the client can show both and let the user choose. Nothing was written.',
  })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    assertOwner(user, userId);
    const profile = await this.profileService.updateProfile(userId, dto);
    return new ProfileResponseDto(profile);
  }

  @Patch(':userId/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update own work preferences' })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() prefs: WorkPreferences,
  ): Promise<ProfileResponseDto> {
    assertOwner(user, userId);
    const profile = await this.profileService.updateWorkPreferences(
      userId,
      prefs,
    );
    return new ProfileResponseDto(profile);
  }

  @Patch(':userId/salary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update own salary expectations' })
  async updateSalary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: { minSalary: number; maxSalary: number },
  ): Promise<ProfileResponseDto> {
    assertOwner(user, userId);
    const profile = await this.profileService.updateSalaryExpectations(
      userId,
      body.minSalary,
      body.maxSalary,
    );
    return new ProfileResponseDto(profile);
  }

}
