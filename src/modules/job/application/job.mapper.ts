import { Job } from '../domain/entities/job.entity';
import { JobResponseDto } from '../presentation/dto/job-response.dto';

export class JobMapper {
  static toResponse(job: Job): JobResponseDto {
    const salary = job.salaryRange;
    return {
      id: job.id,
      companyId: job.companyId,
      title: job.title,
      description: job.description,
      status: job.status.value,
      remoteType: job.remoteType.value,
      location: job.location,
      // `period` is omitted, never defaulted — see SalaryRangeResponseDto.
      salaryRange: salary
        ? {
            min: salary.min,
            max: salary.max,
            currency: salary.currency,
            period: salary.period,
          }
        : undefined,
      skillIds: job.skillIds,
      responsibilities: job.responsibilities,
      requirements: job.requirements,
      benefits: job.benefits,
      bonusPct: job.bonusPct ?? null,
      // Omitted, never defaulted. See the note on JobResponseDto.
      employmentType: job.employmentType,
      experienceLevel: job.experienceLevel,
      // Lets the client render "Apply Now" vs "Apply Externally" without a second
      // request, and without re-deriving the rule the server enforces.
      sourceType: job.sourceType,
      externalUrl: job.externalUrl,
      createdAt: job.props.createdAt.toISOString(),
      updatedAt: job.props.updatedAt.toISOString(),
    };
  }
}
