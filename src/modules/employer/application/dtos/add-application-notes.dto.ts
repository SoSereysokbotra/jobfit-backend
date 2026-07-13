// src/modules/employer/application/dtos/add-application-notes.dto.ts
//
// Body for POST /employer/applications/:id/notes. Simple free-text employer notes.

import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddApplicationNotesDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  notes: string;
}
