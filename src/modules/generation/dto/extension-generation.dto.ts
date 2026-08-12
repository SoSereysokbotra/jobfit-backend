// src/modules/generation/dto/extension-generation.dto.ts
//
// UNGATED generation endpoints for the browser extension (which has no premium
// tier). They generate from the job's displayed identifiers + the user's résumé
// — no stored application/job. The web app's premium routes
// (`/applications/:id/cover-letter`, `/generate/interview`) are untouched.
//
// CAVEAT: because these are ungated, they are also a paywall bypass for the AI
// features if called directly. That is the accepted trade-off of "option B".

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Common extension body: identifiers only — the posting body is never sent. */
class ExtGenerationBaseDto {
  @ApiProperty({ description: "The source's job id from the page URL" })
  @IsString()
  @MaxLength(128)
  externalId!: string;

  @ApiProperty({ example: 'linkedin' })
  @IsString()
  @MaxLength(32)
  source!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  role?: string | null;
}

export class ExtCoverLetterDto extends ExtGenerationBaseDto {}
export class ExtInterviewDto extends ExtGenerationBaseDto {}

export class ExtCoverLetterResponseDto {
  @ApiProperty() text!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: '"ai" | "template"' })
  model!: string | null;
}

export class ExtInterviewQuestionTypeDto {
  @ApiProperty() label!: string;
  @ApiProperty({ description: '0–100 share' }) pct!: number;
}

export class ExtInterviewResponseDto {
  @ApiProperty({ type: [ExtInterviewQuestionTypeDto] })
  questionTypes!: ExtInterviewQuestionTypeDto[];
  @ApiProperty({ type: [String] })
  topQuestions!: string[];
  @ApiPropertyOptional({ type: String, nullable: true, description: '"ai" | "static"' })
  model!: string | null;
}
