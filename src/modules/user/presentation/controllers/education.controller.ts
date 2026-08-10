// src/modules/user/presentation/controllers/education.controller.ts
//
// A user's education records (nested under /profiles/:userId/education). Returns
// EducationResponseDto.
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
  @Public()
  // Same reasoning as the experience list: read far more often than written.
  @UseInterceptors(HttpCacheInterceptor)
  @HttpCache({ maxAge: 60, staleWhileRevalidate: 300 })
  @ApiOperation({
    summary: 'List a user’s education (public)',
    description:
      'Returns a content-hash ETag over the list. Send it back as `If-None-Match` for a ' +
      '304 with no body when nothing has changed.',
  })
  async list(
    @Param('userId') userId: string,
  ): Promise<EducationResponseDto[]> {
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

/** "Own profile only" — the JWT subject must match the path userId. */
function assertOwner(user: AuthenticatedUser, userId: string): void {
  if (user.id !== userId) {
    throw new ForbiddenException('You can only modify your own profile');
  }
}
