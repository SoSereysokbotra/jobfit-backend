import { AggregateRoot } from "@core/domain/aggregate-root";
import { Result } from "@core/application/result";
import { JobStatus } from "../value-objects/job-status.vo";
import { RemoteType } from "../value-objects/remote-type.vo";
import { SalaryRange } from "@shared-kernel/value-objects/salary-range.vo";
import { JobPublishedEvent } from "../events/job-published.event";
import { JobClosedEvent } from "../events/job-closed.event";
import { JobUpdatedEvent } from "../events/job-updated.event";

export interface JobProps {
  companyId: string;
  title: string;
  description: string;
  status: JobStatus;
  remoteType: RemoteType;
  location?: string;
  salaryRange?: SalaryRange;
  skillIds: string[];
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

    this.props.updatedAt = new Date();
    if (changed.length > 0) {
      this.addDomainEvent(new JobUpdatedEvent(this.id, changed));
    }

    return Result.ok();
  }
}
