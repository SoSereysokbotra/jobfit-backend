// src/modules/saved-job/dto/saved-jobs-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

/** The user's saved job ids, most-recently-saved first. */
export class SavedJobsResponseDto {
  @ApiProperty({ type: [String], description: 'Saved job ids, newest first.' })
  jobIds: string[];

  constructor(jobIds: string[]) {
    this.jobIds = jobIds;
  }
}
