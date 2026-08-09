import { AggregateRoot } from "@core/domain/aggregate-root";
import { Result } from "@core/application/result";
import { JobStatus } from "../value-objects/job-status.vo";
import { RemoteType } from "../value-objects/remote-type.vo";
import { SalaryRange } from "@shared-kernel/value-objects/salary-range.vo";
import { JobPublishedEvent } from "../events/job-published.event";
import { JobClosedEvent } from "../events/job-closed.event";
import { JobUpdatedEvent } from "../events/job-updated.event";

/** Can this job be applied to inside JobFits, or only on the site it came from? */
export type JobSourceType = "INTERNAL" | "EXTERNAL";

/** Mirrors the Prisma `EmploymentType` enum. */
export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "TEMPORARY"
  | "FREELANCE";

/** Mirrors the Prisma `JobLevel` enum. */
export type ExperienceLevel =
  | "INTERN"
  | "ENTRY"
  | "MID"
  | "SENIOR"
  | "LEAD"
  | "MANAGER"
  | "DIRECTOR"
  | "C_LEVEL";

export interface JobProps {
  companyId: string;
  title: string;
  description: string;
  status: JobStatus;
  remoteType: RemoteType;
  location?: string;
  salaryRange?: SalaryRange;
  skillIds: string[];
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  bonusPct?: number;
  /**
   * What the posting is, when the employer has said. Undefined is a real answer and must
   * NOT be defaulted anywhere downstream — the frontend's mapper defaulted these to
   * "Full-time"/"Mid-level" and every job card claimed both regardless of the posting.
   */
  employmentType?: EmploymentType;
  experienceLevel?: ExperienceLevel;
  /** Defaults to INTERNAL: a job created here is applicable here. */
  sourceType?: JobSourceType;
  /** The original posting, for EXTERNAL jobs. Where the user must actually apply. */
  externalUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Job extends AggregateRoot<JobProps> {
  get companyId(): string {
    return this.props.companyId;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string {
    return this.props.description;
  }
  get status(): JobStatus {
    return this.props.status;
  }
  get remoteType(): RemoteType {
    return this.props.remoteType;
  }
  get location(): string | undefined {
    return this.props.location;
  }
  get salaryRange(): SalaryRange | undefined {
    return this.props.salaryRange;
  }
  get skillIds(): string[] {
    return this.props.skillIds;
  }
  get responsibilities(): string[] {
    return this.props.responsibilities;
  }
  get requirements(): string[] {
    return this.props.requirements;
  }
  get benefits(): string[] {
    return this.props.benefits;
  }
  get sourceType(): JobSourceType {
    return this.props.sourceType ?? "INTERNAL";
  }
  get externalUrl(): string | undefined {
    return this.props.externalUrl;
  }
  /**
   * EXTERNAL jobs are ingested from another site: no employer exists in JobFits to
   * receive an application, and the real posting lives at `externalUrl`. Applying here
   * would silently go nowhere, so submission must be refused and the user sent onward.
   */
  get isApplicableInApp(): boolean {
    return this.sourceType === "INTERNAL";
  }
  get bonusPct(): number | undefined {
    return this.props.bonusPct;
  }
  get employmentType(): EmploymentType | undefined {
    return this.props.employmentType;
  }
  get experienceLevel(): ExperienceLevel | undefined {
    return this.props.experienceLevel;
  }

  private constructor(props: JobProps, id?: string) {
    super(props, id);
  }

  public static create(props: JobProps, id?: string): Job {
    return new Job(props, id);
  }

  // ── Business operations ──────────────────────────────────────────────────────

  /**
   * Transitions a draft job to PUBLISHED.
   * Enforces invariants: title, description, and salary range must be set.
   */
  public publish(): Result<void> {
    if (this.props.status.isPublished()) {
      return Result.fail("Job is already published");
    }
    if (this.props.status.isClosed()) {
      return Result.fail("Cannot publish a closed job");
    }
    if (!this.props.title.trim()) {
      return Result.fail("Job must have a title before publishing");
    }
    if (!this.props.description.trim()) {
      return Result.fail("Job must have a description before publishing");
    }
    if (!this.props.salaryRange) {
      return Result.fail("Job must have a salary range before publishing");
    }

    this.props.status = JobStatus.published();
    this.props.updatedAt = new Date();
    this.addDomainEvent(new JobPublishedEvent(this.id));
    return Result.ok();
  }

  /**
   * Closes an active job posting.
   */
  public close(): Result<void> {
    if (this.props.status.isClosed()) {
      return Result.fail("Job is already closed");
    }
    if (this.props.status.isDraft()) {
      return Result.fail("Cannot close a draft job — delete it instead");
    }

    this.props.status = JobStatus.closed();
    this.props.updatedAt = new Date();
    this.addDomainEvent(new JobClosedEvent(this.id));
    return Result.ok();
  }

  /**
   * Updates editable fields. Only allowed on DRAFT or PUBLISHED jobs.
   */
  public update(fields: {
    title?: string;
    description?: string;
    location?: string;
    remoteType?: RemoteType;
    salaryRange?: SalaryRange;
    skillIds?: string[];
    responsibilities?: string[];
    requirements?: string[];
    benefits?: string[];
    bonusPct?: number;
    employmentType?: EmploymentType;
    experienceLevel?: ExperienceLevel;
  }): Result<void> {
    if (this.props.status.isClosed()) {
      return Result.fail("Cannot update a closed job");
    }

    const changed: string[] = [];
    if (fields.title !== undefined) {
      this.props.title = fields.title;
      changed.push("title");
    }
    if (fields.description !== undefined) {
      this.props.description = fields.description;
      changed.push("description");
    }
    if (fields.location !== undefined) {
      this.props.location = fields.location;
      changed.push("location");
    }
    if (fields.remoteType !== undefined) {
      this.props.remoteType = fields.remoteType;
      changed.push("remoteType");
    }
    if (fields.salaryRange !== undefined) {
      this.props.salaryRange = fields.salaryRange;
      changed.push("salaryRange");
    }
    if (fields.skillIds !== undefined) {
      this.props.skillIds = fields.skillIds;
      changed.push("skillIds");
    }
    if (fields.responsibilities !== undefined) {
      this.props.responsibilities = fields.responsibilities;
      changed.push("responsibilities");
    }
    if (fields.requirements !== undefined) {
      this.props.requirements = fields.requirements;
      changed.push("requirements");
    }
    if (fields.benefits !== undefined) {
      this.props.benefits = fields.benefits;
      changed.push("benefits");
    }
    if (fields.bonusPct !== undefined) {
      this.props.bonusPct = fields.bonusPct;
      changed.push("bonusPct");
    }
    if (fields.employmentType !== undefined) {
      this.props.employmentType = fields.employmentType;
      changed.push("employmentType");
    }
    if (fields.experienceLevel !== undefined) {
      this.props.experienceLevel = fields.experienceLevel;
      changed.push("experienceLevel");
    }

    this.props.updatedAt = new Date();
    if (changed.length > 0) {
      this.addDomainEvent(new JobUpdatedEvent(this.id, changed));
    }

    return Result.ok();
  }
}
