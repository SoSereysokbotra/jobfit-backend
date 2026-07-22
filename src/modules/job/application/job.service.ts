import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CreateJobUseCase } from './use-cases/create-job.use-case';
import { PublishJobUseCase } from './use-cases/publish-job.use-case';
import { CloseJobUseCase } from './use-cases/close-job.use-case';
import { SearchJobsUseCase } from './use-cases/search-jobs.use-case';
import { JobMapper } from './job.mapper';
import { CreateJobDto } from '../presentation/dto/create-job.dto';
import { UpdateJobDto } from '../presentation/dto/update-job.dto';
import { SearchJobQueryDto } from '../presentation/dto/search-job.query.dto';
import { JobResponseDto } from '../presentation/dto/job-response.dto';
import { Inject } from '@nestjs/common';
import { IJobRepository, JOB_REPOSITORY } from '../domain/job.repository.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RemoteType } from '../domain/value-objects/remote-type.vo';
import { SalaryRange } from '@shared-kernel/value-objects/salary-range.vo';
import { PrismaService } from '@infra/prisma/prisma.service';

/**
 * JobService is the thin orchestrator NestJS controllers call into.
 * It delegates all domain logic to use-cases, converts Results to HTTP exceptions.
 */
@Injectable()
export class JobService {
  constructor(
    private readonly createJobUseCase: CreateJobUseCase,
    private readonly publishJobUseCase: PublishJobUseCase,
    private readonly closeJobUseCase: CloseJobUseCase,
    private readonly searchJobsUseCase: SearchJobsUseCase,
    @Inject(JOB_REPOSITORY) private readonly jobRepo: IJobRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Read-side enrichment: the Job aggregate holds only `companyId`, but the public
   * board needs a display name. We resolve it here (presentation concern) rather
   * than polluting the domain entity. One batched query for a list, keyed by id.
   */
  private async withCompanyName(dto: JobResponseDto): Promise<JobResponseDto> {
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
      select: { name: true },
    });
    return { ...dto, companyName: company?.name };
  }

  private async withCompanyNames(dtos: JobResponseDto[]): Promise<JobResponseDto[]> {
    const ids = [...new Set(dtos.map((d) => d.companyId))];
    if (ids.length === 0) return dtos;
    const companies = await this.prisma.company.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(companies.map((c) => [c.id, c.name]));
    return dtos.map((d) => ({ ...d, companyName: nameById.get(d.companyId) }));
  }

  async create(dto: CreateJobDto, companyId: string): Promise<JobResponseDto> {
    const result = await this.createJobUseCase.execute({ dto, companyId });
    if (result.isFailure) throw new BadRequestException(result.error);
    return JobMapper.toResponse(result.value);
  }

  async findById(id: string): Promise<JobResponseDto> {
    const job = await this.jobRepo.findById(id);
    if (!job) throw new NotFoundException('Job not found');
    return this.withCompanyName(JobMapper.toResponse(job));
  }

  async search(query: SearchJobQueryDto): Promise<JobResponseDto[]> {
    const result = await this.searchJobsUseCase.execute(query);
    if (result.isFailure) throw new BadRequestException(result.error);
    return this.withCompanyNames(result.value.map(JobMapper.toResponse));
  }

  async update(id: string, dto: UpdateJobDto, companyId: string): Promise<JobResponseDto> {
    const job = await this.jobRepo.findById(id);
    if (!job) throw new NotFoundException('Job not found');
    if (job.companyId !== companyId) throw new ForbiddenException();

    let remoteType = dto.remoteType ? RemoteType.fromString(dto.remoteType).value : undefined;
    let salaryRange: SalaryRange | undefined;
    if (dto.minSalary !== undefined && dto.maxSalary !== undefined) {
      salaryRange = SalaryRange.create(dto.minSalary, dto.maxSalary).value;
    }

    const updateResult = job.update({
      title: dto.title,
      description: dto.description,
      location: dto.location,
      remoteType,
      salaryRange,
      skillIds: dto.skillIds,
      responsibilities: dto.responsibilities,
      requirements: dto.requirements,
      benefits: dto.benefits,
      bonusPct: dto.bonusPct,
    });
    if (updateResult.isFailure) throw new BadRequestException(updateResult.error);

    await this.jobRepo.save(job);
    for (const event of job.domainEvents) {
      await this.eventEmitter.emitAsync((event.constructor as { name: string }).name, event);
    }
    job.clearEvents();

    return JobMapper.toResponse(job);
  }

  async publish(id: string, companyId: string): Promise<JobResponseDto> {
    const result = await this.publishJobUseCase.execute({ jobId: id, companyId });
    if (result.isFailure) throw new BadRequestException(result.error);
    return JobMapper.toResponse(result.value);
  }

  async close(id: string, companyId: string): Promise<JobResponseDto> {
    const result = await this.closeJobUseCase.execute({ jobId: id, companyId });
    if (result.isFailure) throw new BadRequestException(result.error);
    return JobMapper.toResponse(result.value);
  }

  async delete(id: string, companyId: string): Promise<void> {
    const job = await this.jobRepo.findById(id);
    if (!job) throw new NotFoundException('Job not found');
    if (job.companyId !== companyId) throw new ForbiddenException();
    await this.jobRepo.delete(id);
  }
}
