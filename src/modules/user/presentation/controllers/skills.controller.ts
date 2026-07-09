// src/modules/user/presentation/controllers/skills.controller.ts
//
// A user's skills (nested under /profiles/:userId/skills). Returns SkillResponseDto.
//
// AUTH NOTE: the docs use @UseGuards(SupabaseAuthGuard); this project is self-managed JWT
// with JwtAuthGuard registered GLOBALLY (secure-by-default). Write routes keep an explicit
// @UseGuards(JwtAuthGuard) to mirror intent and enforce "own profile only" (JWT subject ==
// :userId). The list route is @Public().

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
import { SkillsService } from '../../application/services/skills.service';
import { AddSkillDto } from '../../application/dtos/add-skill.dto';
import { SkillResponseDto } from '../../application/dtos/skill-response.dto';

@ApiTags('Skills')
@ApiBearerAuth()
@Controller('profiles/:userId/skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a skill to own profile' })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AddSkillDto,
  ): Promise<SkillResponseDto> {
    assertOwner(user, userId);
    const skill = await this.skillsService.addSkill(userId, dto);
    return new SkillResponseDto(skill);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List a user’s skills (public)' })
  async list(
    @Param('userId') userId: string,
  ): Promise<SkillResponseDto[]> {
    const skills = await this.skillsService.getSkills(userId);
    return skills.map((skill) => new SkillResponseDto(skill));
  }

  @Delete(':skillId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a skill from own profile' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('skillId') skillId: string,
  ): Promise<void> {
    assertOwner(user, userId);
    await this.skillsService.removeSkill(userId, skillId);
  }

  @Patch(':skillId/endorse')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Endorse a skill' })
  async endorse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('skillId') skillId: string,
  ): Promise<SkillResponseDto> {
    assertOwner(user, userId);
    const skill = await this.skillsService.endorseSkill(userId, skillId);
    return new SkillResponseDto(skill);
  }
}

/** "Own profile only" — the JWT subject must match the path userId. */
function assertOwner(user: AuthenticatedUser, userId: string): void {
  if (user.id !== userId) {
    throw new ForbiddenException('You can only modify your own profile');
  }
}
