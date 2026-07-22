import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const TONES = ['professional', 'enthusiastic', 'concise', 'friendly'] as const;

export class GenerateCoverLetterDto {
  @ApiPropertyOptional({ enum: TONES, default: 'professional' })
  @IsOptional()
  @IsString()
  @IsIn(TONES)
  tone?: string;
}
