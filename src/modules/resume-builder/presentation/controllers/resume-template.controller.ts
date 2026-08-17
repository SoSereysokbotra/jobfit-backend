// src/modules/resume-builder/presentation/controllers/resume-template.controller.ts
//
// The read-only template catalogue that backs the builder's template picker.
//
// @Public() — JwtAuthGuard is a global APP_GUARD, so without this decorator the
// route would require a JWT. Templates carry no user content, so this follows the
// same pattern as GET /jobs and GET /skills/:skillId/learning-resources.
//
// READ-ONLY, DELIBERATELY. Templates are designs we author and seed; users select
// one, they never supply one. There is no POST/PATCH/DELETE and no upload route
// here, and `layoutConfig` is never accepted from a client. If template management
// is ever needed it belongs under /admin/* behind @Roles('ADMIN').

import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';
import { ResumeTemplateService } from '../../application/services/resume-template.service';
import {
  ListResumeTemplatesQueryDto,
  ResumeTemplateResponseDto,
} from '../../application/dtos/resume-template.dto';

@ApiTags('Resume Builder')
@Controller('resume-builder/templates')
export class ResumeTemplateController {
  constructor(private readonly templates: ResumeTemplateService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'List the résumé templates you can build with (public)',
    description:
      'Returns only ACTIVE templates, ordered by category then name so the picker ' +
      'does not reshuffle between loads. No auth required — these carry no user data.\n\n' +
      '`atsOnly=true` narrows to ATS-friendly templates; `atsOnly=false` means "do ' +
      'not filter" rather than "show the non-ATS ones".\n\n' +
      '⚠️ `thumbnailUrl` is a **root-relative path served by the frontend** ' +
      '(this API serves no static assets), and the images there are currently ' +
      'generated **placeholders**, not designed thumbnails.',
  })
  @ApiOkResponse({ type: ResumeTemplateResponseDto, isArray: true })
  async list(
    @Query() query: ListResumeTemplatesQueryDto,
  ): Promise<ResumeTemplateResponseDto[]> {
    const rows = await this.templates.list({
      atsOnly: query.atsOnly,
      category: query.category,
    });
    return rows.map((row) => new ResumeTemplateResponseDto(row));
  }
}
