// src/modules/resume-builder/application/dtos/import-from-profile.dto.ts
//
// Which sections to prefill from the user's live profile data.
//
// "projects" is deliberately NOT importable: there is no Project model in the
// schema, so there is nothing to copy from. The builder's project section is
// manual-entry for MVP. Asking for it is a 400 naming the accepted values rather
// than a silent no-op — silently dropping a requested section would look like the
// import worked and left the user's projects mysteriously empty.

import { ArrayNotEmpty, IsArray, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Sections with a profile-side source. Order here is the order they are applied. */
export const IMPORTABLE_SECTIONS = [
  'summary',
  'experience',
  'education',
  'skills',
  'certifications',
] as const;

export type ImportableSection = (typeof IMPORTABLE_SECTIONS)[number];

export class ImportFromProfileDto {
  @ApiProperty({
    enum: IMPORTABLE_SECTIONS,
    isArray: true,
    description:
      'Sections to prefill. Each named section is REPLACED wholesale with your ' +
      'profile data; sections you do not name are left untouched. ' +
      '"projects" is not accepted — there is no profile-side project data to import.',
    example: ['experience', 'education', 'skills'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(IMPORTABLE_SECTIONS as unknown as string[], {
    each: true,
    message: `each value in sections must be one of: ${IMPORTABLE_SECTIONS.join(', ')} ("projects" cannot be imported — there is no profile-side project data)`,
  })
  sections: ImportableSection[];
}
