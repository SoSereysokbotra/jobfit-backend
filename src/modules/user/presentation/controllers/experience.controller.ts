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
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { HttpCache } from '@common/decorators/http-cache.decorator';
import { HttpCacheInterceptor } from '@common/interceptors/http-cache.interceptor';
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
  // Public profile data: edited occasionally, read on every profile view. Short freshness
  // so an edit surfaces quickly, with the ETag doing the real work — an unchanged list
  // revalidates to a 304 instead of re-sending every record.
  @UseInterceptors(HttpCacheInterceptor)
  @HttpCache({ maxAge: 60, staleWhileRevalidate: 300 })
  @ApiOperation({
    summary: 'List a user’s work experience (public)',
    description:
      'Returns a content-hash ETag over the list. Send it back as `If-None-Match` for a ' +
      '304 with no body when nothing has changed.',
  })
  async list(
    @Param('userId') userId: string,
  ): Promise<ExperienceResponseDto[]> {
    const items = await this.experienceService.getExperiences(userId);
    return items.map((item) => new ExperienceResponseDto(item));
  }

  @Patch(':expId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update own work experience',
    description:
      'Requires `expectedUpdatedAt` — the `updatedAt` you last saw. If the record changed ' +
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
    @Param('expId') expId: string,
    @Body() dto: UpdateExperienceDto,
  ): Promise<ExperienceResponseDto> {
    assertOwner(user, userId);
    // user.id, not the path param: assertOwner already ties them together, and passing the
    // authenticated id keeps the service's ownership check independent of the URL.
    const experience = await this.experienceService.updateExperience(
      expId,
      dto,
      user.id,
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
