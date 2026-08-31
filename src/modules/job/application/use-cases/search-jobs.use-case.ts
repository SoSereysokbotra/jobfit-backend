import { Inject, Injectable } from '@nestjs/common';
import { IJobRepository, JOB_REPOSITORY, JobFilters } from '../../domain/job.repository.interface';
import { Job } from '../../domain/entities/job.entity';
import { IUseCase } from '@core/application/use-case.interface';
import { Result } from '@core/application/result';
import { SearchJobQueryDto } from '../../presentation/dto/search-job.query.dto';

export type SearchJobsRequest = SearchJobQueryDto;

@Injectable()
export class SearchJobsUseCase implements IUseCase<SearchJobsRequest, Job[]> {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepo: IJobRepository,
  ) {}

  async execute(query: SearchJobsRequest): Promise<Result<Job[]>> {
    // Public browse is PUBLISHED-only, and the caller does not get a say in it.
    // `status` used to be passed straight through from the query string, so an
    // unauthenticated `?status=DRAFT` enumerated every unpublished posting on the
    // platform and an omitted status returned drafts mixed into normal results. A
    // draft is a half-written posting the employer has not released; it is not
    // public data. Closed postings stay reachable by id (a candidate who applied
    // still has to be able to read what they applied to) but are not browsable.
    const filters: JobFilters = {
      status: 'PUBLISHED',
      remoteType: query.remoteType,
      skillIds: query.skillIds,
      minSalary: query.minSalary,
      maxSalary: query.maxSalary,
    };

    const jobs = await this.jobRepo.findMany(
      filters,
      query.limit ?? 20,
      query.offset ?? 0,
    );

    return Result.ok(jobs);
  }
}
