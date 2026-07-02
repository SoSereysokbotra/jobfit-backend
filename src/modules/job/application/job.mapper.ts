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
      salaryRange: salary
        ? { min: salary.min, max: salary.max, currency: salary.currency }
        : undefined,
      skillIds: job.skillIds,
      createdAt: job.props.createdAt.toISOString(),
      updatedAt: job.props.updatedAt.toISOString(),
    };
  }
}
