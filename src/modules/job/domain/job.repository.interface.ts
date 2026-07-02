import { Job } from './entities/job.entity';

export interface JobFilters {
  status?: string;
  companyId?: string;
  remoteType?: string;
  skillIds?: string[];
  minSalary?: number;
  maxSalary?: number;
}

export interface IJobRepository {
  findById(id: string): Promise<Job | null>;
  findMany(filters: JobFilters, limit: number, offset: number): Promise<Job[]>;
  save(job: Job): Promise<void>;
  delete(id: string): Promise<void>;
}

export const JOB_REPOSITORY = Symbol('IJobRepository');
