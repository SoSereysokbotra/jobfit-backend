// src/modules/user/presentation/controllers/profile.controller.ts
//
// Profile endpoints. Returns ProfileResponseDto (never the domain entity).
//
// AUTH NOTE: the docs use @UseGuards(SupabaseAuthGuard); this project is self-managed JWT
// (app-JWT canonical) with JwtAuthGuard registered GLOBALLY (secure-by-default), so every
// route requires a JWT unless marked @Public(). Write routes keep an explicit
// @UseGuards(JwtAuthGuard) to mirror the docs' intent. GET /profiles/:userId is @Public().
// Mutations enforce "own profile only" by comparing the JWT subject to :userId.

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
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
  @Public()
  @ApiOperation({ summary: 'Get a user profile (public)' })
  async getByUserId(
    @Param('userId') userId: string,
  ): Promise<ProfileResponseDto> {
    const profile = await this.profileService.getProfile(userId); // throws NotFound if absent
    return new ProfileResponseDto(profile);
  }

  @Patch(':userId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update own profile' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    this.assertOwner(user, userId);
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
    this.assertOwner(user, userId);
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
    this.assertOwner(user, userId);
    const profile = await this.profileService.updateSalaryExpectations(
      userId,
      body.minSalary,
      body.maxSalary,
    );
    return new ProfileResponseDto(profile);
  }

  /** "Own profile only" — the JWT subject must match the target userId. */
  private assertOwner(user: AuthenticatedUser, userId: string): void {
    if (user.id !== userId) {
      throw new ForbiddenException('You can only modify your own profile');
    }
  }
}
