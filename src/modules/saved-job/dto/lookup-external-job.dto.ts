// src/modules/saved-job/dto/lookup-external-job.dto.ts
//
// Query for "have I already saved this posting?". Both fields are declared because the
// global ValidationPipe rejects anything it wasn't told about.

import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class LookupExternalJobDto {
  @ApiProperty({ example: 'linkedin' })
  @IsString()
  @MaxLength(32)
  source!: string;

  @ApiProperty({ description: "The source's job id, from the page URL" })
  @IsString()
  @MaxLength(128)
  externalId!: string;
}
