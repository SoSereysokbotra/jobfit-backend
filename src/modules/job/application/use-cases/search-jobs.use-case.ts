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
    const filters: JobFilters = {
      status: query.status,
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
