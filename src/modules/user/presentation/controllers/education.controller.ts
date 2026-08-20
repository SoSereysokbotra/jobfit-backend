// src/modules/user/presentation/controllers/education.controller.ts
//
// A user's education records (nested under /profiles/:userId/education). Returns
// EducationResponseDto.
//
// AUTH NOTE: SupabaseAuthGuard in the docs -> global JwtAuthGuard here (secure-by-default);
// write routes keep an explicit @UseGuards(JwtAuthGuard) and enforce "own profile only"
// (JWT subject == :userId).
//
// The list route USED TO BE @Public(). Education history is profile PII keyed by user id
// (MENTOR_REVIEW_2026-08-18 §3), so it is now self-or-admin, matching the profile read.
// Its @HttpCache scope moved to 'private' at the same time: a per-user response must never
// be storable by a shared CDN or proxy that would hand it to the next caller.

import {
  Body,
  Controller,
  Delete,
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
import { HttpCache } from '@common/decorators/http-cache.decorator';
import { HttpCacheInterceptor } from '@common/interceptors/http-cache.interceptor';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { assertOwner, assertSelfOrAdmin } from '@common/utils/ownership.util';
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from '@common/guards/jwt-auth.guard';
import { EducationService } from '../../application/services/education.service';
import { AddEducationDto } from '../../application/dtos/add-education.dto';
import { UpdateEducationDto } from '../../application/dtos/update-education.dto';
import { EducationResponseDto } from '../../application/dtos/education-response.dto';

@ApiTags('Education')
@ApiBearerAuth()
@Controller('profiles/:userId/education')
export class EducationController {
  constructor(private readonly educationService: EducationService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an education record to own profile' })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AddEducationDto,
  ): Promise<EducationResponseDto> {
    assertOwner(user, userId);
    const education = await this.educationService.addEducation(userId, dto);
    return new EducationResponseDto(education);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  // Same reasoning as the experience list: read far more often than written.
  // scope 'private' — browser only, never a shared cache: see the header note.
  @UseInterceptors(HttpCacheInterceptor)
  @HttpCache({ maxAge: 60, staleWhileRevalidate: 300, scope: 'private' })
  @ApiOperation({
    summary: 'List a user’s education (own, or any as ADMIN)',
    description:
      'Returns a content-hash ETag over the list. Send it back as `If-None-Match` for a ' +
      '304 with no body when nothing has changed.',
  })
  async list(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<EducationResponseDto[]> {
    assertSelfOrAdmin(caller, userId);
    const items = await this.educationService.getEducations(userId);
    return items.map((item) => new EducationResponseDto(item));
  }

  @Patch(':eduId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update own education record',
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
    @Param('eduId') eduId: string,
    @Body() dto: UpdateEducationDto,
  ): Promise<EducationResponseDto> {
    assertOwner(user, userId);
    const education = await this.educationService.updateEducation(
      eduId,
      dto,
      user.id,
    );
    return new EducationResponseDto(education);
  }

  @Delete(':eduId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete own education record' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('eduId') eduId: string,
  ): Promise<void> {
    assertOwner(user, userId);
    await this.educationService.deleteEducation(eduId);
  }
}

