// src/modules/resume/application/dtos/upload-resume.dto.ts
//
// Body fields for a resume upload. The file itself is handled by FileInterceptor +
// @UploadedFile (validated for type/size in the controller and service), not here.

import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadResumeDto {
  @ApiPropertyOptional({ minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;
}
