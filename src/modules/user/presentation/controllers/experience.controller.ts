// src/modules/user/presentation/controllers/experience.controller.ts
//
// A user's work experience (nested under /profiles/:userId/experience). Returns
// ExperienceResponseDto.
//
// AUTH NOTE: SupabaseAuthGuard in the docs -> global JwtAuthGuard here (secure-by-default);
// write routes keep an explicit @UseGuards(JwtAuthGuard) and enforce "own profile only"
// (JWT subject == :userId). The list route is @Public().

import {
  Body,
  Controller,
  Delete,
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
import { ExperienceService } from '../../application/services/experience.service';
import { AddExperienceDto } from '../../application/dtos/add-experience.dto';
import { UpdateExperienceDto } from '../../application/dtos/update-experience.dto';
import { ExperienceResponseDto } from '../../application/dtos/experience-response.dto';

@ApiTags('Experience')
@ApiBearerAuth()
@Controller('profiles/:userId/experience')
export class ExperienceController {
  constructor(private readonly experienceService: ExperienceService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a work experience to own profile' })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AddExperienceDto,
  ): Promise<ExperienceResponseDto> {
    assertOwner(user, userId);
    const experience = await this.experienceService.addExperience(userId, dto);
    return new ExperienceResponseDto(experience);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List a user’s work experience (public)' })
  async list(
    @Param('userId') userId: string,
  ): Promise<ExperienceResponseDto[]> {
    const items = await this.experienceService.getExperiences(userId);
    return items.map((item) => new ExperienceResponseDto(item));
  }

  @Patch(':expId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update own work experience' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('expId') expId: string,
    @Body() dto: UpdateExperienceDto,
  ): Promise<ExperienceResponseDto> {
    assertOwner(user, userId);
    const experience = await this.experienceService.updateExperience(
      expId,
      dto,
    );
    return new ExperienceResponseDto(experience);
  }

  @Delete(':expId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete own work experience' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('expId') expId: string,
  ): Promise<void> {
    assertOwner(user, userId);
    await this.experienceService.deleteExperience(expId);
  }
}

/** "Own profile only" — the JWT subject must match the path userId. */
function assertOwner(user: AuthenticatedUser, userId: string): void {
  if (user.id !== userId) {
    throw new ForbiddenException('You can only modify your own profile');
  }
}
