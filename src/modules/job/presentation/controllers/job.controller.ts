import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { JobService } from '../../application/job.service';
import { SearchJobQueryDto } from '../dto/search-job.query.dto';
import { JobResponseDto } from '../dto/job-response.dto';

@ApiTags('Jobs')
@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Search and browse published jobs' })
  search(@Query() query: SearchJobQueryDto): Promise<JobResponseDto[]> {
    return this.jobService.search(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a job by ID' })
  findById(@Param('id') id: string): Promise<JobResponseDto> {
    return this.jobService.findById(id);
  }
}
