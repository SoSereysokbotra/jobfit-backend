import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IJobRepository, JOB_REPOSITORY } from '../../domain/job.repository.interface';
import { Job } from '../../domain/entities/job.entity';
import { IUseCase } from '@core/application/use-case.interface';
import { Result } from '@core/application/result';

export type PublishJobRequest = { jobId: string; companyId: string };

@Injectable()
export class PublishJobUseCase implements IUseCase<PublishJobRequest, Job> {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepo: IJobRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute({ jobId, companyId }: PublishJobRequest): Promise<Result<Job>> {
    const job = await this.jobRepo.findById(jobId);
    if (!job) return Result.fail('Job not found');
    if (job.companyId !== companyId) return Result.fail('Forbidden');

    const result = job.publish();
    if (result.isFailure) return Result.fail(result.error);

    await this.jobRepo.save(job);

    for (const event of job.domainEvents) {
      await this.eventEmitter.emitAsync((event.constructor as { name: string }).name, event);
    }
    job.clearEvents();

    return Result.ok(job);
  }
}
