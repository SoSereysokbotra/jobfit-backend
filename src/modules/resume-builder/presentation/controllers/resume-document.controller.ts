// src/modules/resume-builder/presentation/controllers/resume-document.controller.ts
//
// Builder document CRUD + the six bulk-replace content sections.
//
// Every route is authenticated and self-scoped: the user comes from the JWT, never
// from the path. A document the caller does not own returns **404, not 403** — a
// 403 confirms the id exists. This matches the `resume` module we mirror; the
// `application` module's 403 is the outlier.

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
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AuthenticatedUser, JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';

import { ResumeDocumentService } from '../../application/services/resume-document.service';
import {
  CreateResumeDocumentDto,
  UpdateResumeDocumentDto,
} from '../../application/dtos/resume-document.dto';
import {
  ResumeDocumentDetailDto,
  ResumeDocumentListItemDto,
} from '../../application/dtos/resume-document-response.dto';
import {
  PutCertificationsDto,
  PutEducationDto,
  PutExperienceDto,
  PutProjectsDto,
  PutSkillsDto,
  PutSummaryDto,
} from '../../application/dtos/sections.dto';
import {
  IMPORTABLE_SECTIONS,
  ImportFromProfileDto,
} from '../../application/dtos/import-from-profile.dto';
import {
  ExportResumeDocumentDto,
  ExportResumeDocumentResponseDto,
} from '../../application/dtos/export-resume-document.dto';
import { ResumeExportService } from '../../application/services/resume-export.service';

const REPLACE_NOTE =
  'BULK REPLACE, not merge: the array you send becomes the entire section and ' +
  '`order` is taken from array index. Sending a shorter array deletes the extra ' +
  'rows. Applied in a transaction, so a failure cannot half-update the section.';

const NOT_FOUND_NOTE =
  'Returned both when the document does not exist and when it belongs to another ' +
  'user — the two are deliberately indistinguishable.';

@ApiTags('Resume Builder')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('resume-builder/documents')
export class ResumeDocumentController {
  constructor(
    private readonly documents: ResumeDocumentService,
    private readonly exporter: ResumeExportService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a draft document',
    description:
      'Requires `title` and an ACTIVE `templateId`. Spacing/margin/colour default ' +
      'to DEFAULT/NORMAL/first-preset. The résumé header (name, email, phone, ' +
      'location, links) is SNAPSHOTTED from your profile — you cannot set it here, ' +
      'but you can edit it afterwards via PATCH, and doing so never writes back to ' +
      'your profile. A user with no profile gets an empty header, not an error.',
  })
  @ApiCreatedResponse({ type: ResumeDocumentListItemDto })
  @ApiBadRequestResponse({ description: 'Unknown or inactive templateId.' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateResumeDocumentDto,
  ): Promise<ResumeDocumentListItemDto> {
    const row = await this.documents.create(user.id, dto);
    return new ResumeDocumentListItemDto(row);
  }

  @Get()
  @ApiOperation({
    summary: 'List your documents (most recently updated first)',
    description: 'Settings only — use GET /:id for the full nested document.',
  })
  @ApiOkResponse({ type: ResumeDocumentListItemDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ResumeDocumentListItemDto[]> {
    const rows = await this.documents.list(user.id);
    return rows.map((row) => new ResumeDocumentListItemDto(row));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one document with every section',
    description:
      'Settings plus all six sections in one response, so the editor loads ' +
      'everything in a single call. Sections come back sorted by `order`.',
  })
  @ApiOkResponse({ type: ResumeDocumentDetailDto })
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ResumeDocumentDetailDto> {
    return new ResumeDocumentDetailDto(await this.documents.get(id, user.id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update settings, title, status or the résumé header',
    description:
      'Partial update. Header fields belong to the document after creation — ' +
      'editing them here does NOT touch your profile, and later profile edits do ' +
      'not change this document.',
  })
  @ApiOkResponse({ type: ResumeDocumentListItemDto })
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateResumeDocumentDto,
  ): Promise<ResumeDocumentListItemDto> {
    const row = await this.documents.update(id, user.id, dto);
    return new ResumeDocumentListItemDto(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete a document',
    description:
      'Sets `deletedAt`. An already-exported Resume is deliberately NOT deleted — ' +
      'you may already have attached it to submitted applications.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.documents.remove(id, user.id);
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Deep-copy a document',
    description:
      'Copies settings, header and every content row as a new document titled ' +
      '"{title} (Copy)", with status reset to DRAFT and no export link.',
  })
  @ApiCreatedResponse({ type: ResumeDocumentListItemDto })
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ResumeDocumentListItemDto> {
    const row = await this.documents.duplicate(id, user.id);
    return new ResumeDocumentListItemDto(row);
  }

  @Post(':id/import-from-profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prefill sections from your profile',
    description:
      `Accepted sections: ${IMPORTABLE_SECTIONS.join(', ')}. Each named section is ` +
      'REPLACED with a snapshot of your profile data; sections you do not name are ' +
      'left untouched.\n\n' +
      'A **one-time copy, not a live link** — after importing, the document owns ' +
      'those rows. Editing them never writes back to your profile, and later profile ' +
      'edits do not change an already-imported document.\n\n' +
      'CONTENT ONLY: the template, presentation settings and the résumé header are ' +
      'never touched. Soft-deleted profile rows are excluded. A section with no ' +
      'profile data imports as empty — that is success, not an error.\n\n' +
      '`"projects"` is rejected: there is no profile-side project data to import, so ' +
      'the builder\'s project section is manual-entry for now.\n\n' +
      'Returns the full updated document, so the editor can re-render without a ' +
      'second call.',
  })
  @ApiOkResponse({ type: ResumeDocumentDetailDto })
  @ApiBadRequestResponse({
    description: `sections must be a non-empty array of: ${IMPORTABLE_SECTIONS.join(', ')}.`,
  })
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async importFromProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ImportFromProfileDto,
  ): Promise<ResumeDocumentDetailDto> {
    const row = await this.documents.importFromProfile(id, user.id, dto);
    return new ResumeDocumentDetailDto(row);
  }

  @Post(':id/export')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Render the document to PDF and file it as a résumé',
    description:
      'Renders the document using its template’s layout and this document’s ' +
      'spacing/margin/colour/font, stores the PDF in the private `resumes` bucket, ' +
      'and creates a normal Resume row — so the result appears in your résumé list, ' +
      'can be ATS-scored, and can be attached when applying, with no special-casing.\n\n' +
      '**PDF only.** `format: "docx"` is rejected at validation (deferred, not ' +
      'supported).\n\n' +
      'The résumé is filed as already-parsed: its structured data is written ' +
      'directly from the document rather than re-parsed out of the PDF.\n\n' +
      '**Re-exporting supersedes.** If this document was exported before, the ' +
      'previous résumé is soft-deleted so your picker shows one current file per ' +
      'document. Soft, so applications you already submitted keep their attachment.\n\n' +
      'Returns a **signed, time-limited** download URL — the bucket is private. ' +
      'If rendering fails nothing is saved: no file, no Resume row, no changed link.',
  })
  @ApiCreatedResponse({ type: ExportResumeDocumentResponseDto })
  @ApiBadRequestResponse({ description: 'Unsupported format (only "pdf" for MVP).' })
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    // Body is validated for the format enum; the value itself is PDF-only today.
    @Body() _dto: ExportResumeDocumentDto,
  ): Promise<ExportResumeDocumentResponseDto> {
    return this.exporter.export(id, user.id);
  }

  // ── Content sections ───────────────────────────────────────────────────────

  @Put(':id/summary')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Replace the summary',
    description: 'Summary is 1:1 with the document. Send "" to clear it.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async putSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PutSummaryDto,
  ): Promise<void> {
    await this.documents.putSummary(id, user.id, dto);
  }

  @Put(':id/experience')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Replace the experience section', description: REPLACE_NOTE })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async putExperience(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PutExperienceDto,
  ): Promise<void> {
    await this.documents.putExperience(id, user.id, dto);
  }

  @Put(':id/education')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Replace the education section', description: REPLACE_NOTE })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async putEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PutEducationDto,
  ): Promise<void> {
    await this.documents.putEducation(id, user.id, dto);
  }

  @Put(':id/skills')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Replace the skills section', description: REPLACE_NOTE })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async putSkills(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PutSkillsDto,
  ): Promise<void> {
    await this.documents.putSkills(id, user.id, dto);
  }

  @Put(':id/certifications')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Replace the certifications section',
    description: REPLACE_NOTE,
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async putCertifications(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PutCertificationsDto,
  ): Promise<void> {
    await this.documents.putCertifications(id, user.id, dto);
  }

  @Put(':id/projects')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Replace the projects section',
    description:
      `${REPLACE_NOTE} Manual entry only — there is no Project model to import from.`,
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: NOT_FOUND_NOTE })
  async putProjects(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PutProjectsDto,
  ): Promise<void> {
    await this.documents.putProjects(id, user.id, dto);
  }
}
