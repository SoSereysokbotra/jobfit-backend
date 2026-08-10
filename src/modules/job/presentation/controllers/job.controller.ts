import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { HttpCache } from '@common/decorators/http-cache.decorator';
import { HttpCacheInterceptor } from '@common/interceptors/http-cache.interceptor';
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
  // A posting barely changes once published, and it is the single most re-fetched resource
  // in the app: saved jobs, applications and recommendations all render from it. 5 minutes
  // fresh, then servable stale for 10 more while the client revalidates.
  @UseInterceptors(HttpCacheInterceptor)
  @HttpCache({ maxAge: 300, staleWhileRevalidate: 600 })
  @ApiOperation({
    summary: 'Get a job by ID',
    description:
      'Returns an ETag derived from the job’s `updatedAt`. Send it back as `If-None-Match` ' +
      'to get a 304 with no body when the posting has not changed.',
  })
  findById(@Param('id') id: string): Promise<JobResponseDto> {
    return this.jobService.findById(id);
  }
}
