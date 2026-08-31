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
      select: {
        name: true,
        description: true,
        website: true,
        industry: true,
        size: true,
        foundedYear: true,
        city: true,
        country: true,
        glassdoorRating: true,
        glassdoorReviews: true,
      },
    });
    if (!company) return dto;

    // `Company.industry` holds an Industry id; resolve it so the client never renders a
    // raw UUID.
    const industry = company.industry
      ? await this.prisma.industry.findUnique({
          where: { id: company.industry },
          select: { name: true },
        })
      : null;

    const location = [company.city, company.country].filter(Boolean).join(', ');

    // Every field is omitted when its column is null. The panel this feeds used to
    // hardcode size, funding and a Glassdoor rating for every employer — publishing
    // invented facts about real businesses — so a missing value must produce a missing
    // field, never a plausible default.
    return {
      ...dto,
      companyName: company.name,
      company: {
        name: company.name,
        description: company.description ?? undefined,
        website: company.website ?? undefined,
        industry: industry?.name ?? undefined,
        size: company.size ?? undefined,
        foundedYear: company.foundedYear ?? undefined,
        location: location || undefined,
        glassdoorRating: company.glassdoorRating ?? undefined,
        glassdoorReviews: company.glassdoorReviews ?? undefined,
      },
    };
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

  /**
   * Public read of a single posting. Only reached from the @Public() `GET /jobs/:id`.
   *
   * A DRAFT answers 404, deliberately worded the same as a job that does not exist: the
   * caller is anonymous, so "exists but is a draft" is not a distinction they are owed,
   * and saying it would confirm which ids are real. CLOSED stays readable — a candidate
   * who already applied has to be able to open what they applied to, and their saved
   * jobs and application history render from this endpoint.
   *
   * Employers read their own drafts through `GET /employer/jobs`, which is scoped to
   * their company.
   */
  async findById(id: string): Promise<JobResponseDto> {
    const job = await this.jobRepo.findById(id);
    if (!job) throw new NotFoundException('Job not found');
    if (job.status.isDraft()) throw new NotFoundException('Job not found');
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

    const remoteType = dto.remoteType ? RemoteType.fromString(dto.remoteType).value : undefined;
    let salaryRange: SalaryRange | undefined;
    if (dto.minSalary !== undefined && dto.maxSalary !== undefined) {
      salaryRange = SalaryRange.create(
        dto.minSalary,
        dto.maxSalary,
        dto.salaryCurrency,
        dto.salaryPeriod,
      ).value;
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
      employmentType: dto.employmentType,
      experienceLevel: dto.experienceLevel,
    });
    if (updateResult.isFailure) throw new BadRequestException(updateResult.error);

    await this.jobRepo.save(job);
    for (const event of job.domainEvents) {
      await this.eventEmitter.emitAsync((event.constructor as { name: string }).name, event);
    }
    job.clearEvents();

    return JobMapper.toResponse(job);
  }

  /**
   * Map a use-case failure to the right HTTP status.
   *
   * These use cases report ownership and existence failures as plain `Result.fail`
   * strings, which publish/close used to blanket-convert into 400. That answered
   * "Forbidden" with a Bad Request — the same refusal `update` and `delete` correctly
   * return as 403 — so the status contradicted the message and told a client nothing
   * it could branch on. Only genuine rule violations ("a closed job cannot be
   * published") are 400 here.
   */
  private failResult(error: string): never {
    if (error === 'Forbidden') throw new ForbiddenException();
    if (error === 'Job not found') throw new NotFoundException(error);
    throw new BadRequestException(error);
  }

  async publish(id: string, companyId: string): Promise<JobResponseDto> {
    const result = await this.publishJobUseCase.execute({ jobId: id, companyId });
    if (result.isFailure) this.failResult(result.error);
    return JobMapper.toResponse(result.value);
  }

  async close(id: string, companyId: string): Promise<JobResponseDto> {
    const result = await this.closeJobUseCase.execute({ jobId: id, companyId });
    if (result.isFailure) this.failResult(result.error);
    return JobMapper.toResponse(result.value);
  }

  async delete(id: string, companyId: string): Promise<void> {
    const job = await this.jobRepo.findById(id);
    if (!job) throw new NotFoundException('Job not found');
    if (job.companyId !== companyId) throw new ForbiddenException();
    await this.jobRepo.delete(id);
  }
}
