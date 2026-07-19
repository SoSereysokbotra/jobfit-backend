// src/modules/saved-job/dto/save-job.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SaveJobDto {
  @ApiProperty({ description: 'Id of the job to save.' })
  @IsNotEmpty()
  @IsString()
  jobId: string;
}
