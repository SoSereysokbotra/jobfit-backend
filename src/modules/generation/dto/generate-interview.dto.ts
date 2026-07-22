import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateInterviewDto {
  @ApiProperty({ description: 'Job to tailor the interview prep to.' })
  @IsNotEmpty()
  @IsString()
  jobId: string;

  @ApiProperty({ example: 'SENIOR', description: 'Target seniority level.' })
  @IsNotEmpty()
  @IsString()
  level: string;

  @ApiProperty({ enum: ['questions', 'feedback'] })
  @IsIn(['questions', 'feedback'])
  kind: 'questions' | 'feedback';

  @ApiPropertyOptional({ description: 'Candidate answer — required when kind = "feedback".' })
  @IsOptional()
  @IsString()
  answer?: string;
}
