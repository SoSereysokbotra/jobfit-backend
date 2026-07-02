import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IJobRepository, JOB_REPOSITORY } from '../../domain/job.repository.interface';
import { Job } from '../../domain/entities/job.entity';
import { IUseCase } from '@core/application/use-case.interface';
import { Result } from '@core/application/result';
import { JobStatus } from '../../domain/value-objects/job-status.vo';
import { RemoteType } from '../../domain/value-objects/remote-type.vo';
import { SalaryRange } from '@shared-kernel/value-objects/salary-range.vo';
import { CreateJobDto } from '../../presentation/dto/create-job.dto';

export interface CreateJobRequest {
  dto: CreateJobDto;
  companyId: string;
}

@Injectable()
export class CreateJobUseCase implements IUseCase<CreateJobRequest, Job> {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepo: IJobRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(request: CreateJobRequest): Promise<Result<Job>> {
    const { dto, companyId } = request;

    const remoteTypeResult = RemoteType.fromString(dto.remoteType);
    if (remoteTypeResult.isFailure) return Result.fail(remoteTypeResult.error);

    let salaryRange: SalaryRange | undefined;
    if (dto.minSalary !== undefined && dto.maxSalary !== undefined) {
      const salaryResult = SalaryRange.create(dto.minSalary, dto.maxSalary);
      if (salaryResult.isFailure) return Result.fail(salaryResult.error);
      salaryRange = salaryResult.value;
    }

    const job = Job.create({
      companyId,
      title: dto.title,
      description: dto.description,
      status: JobStatus.draft(),
      remoteType: remoteTypeResult.value,
      location: dto.location,
      salaryRange,
      skillIds: dto.skillIds ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.jobRepo.save(job);

    // Dispatch any domain events the aggregate raised
    for (const event of job.domainEvents) {
      await this.eventEmitter.emitAsync(
        (event.constructor as { name: string }).name,
        event,
      );
    }
    job.clearEvents();

    return Result.ok(job);
  }
}
