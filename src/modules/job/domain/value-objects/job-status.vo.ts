import { ValueObject } from '@core/domain/value-object';
import { Result } from '@core/application/result';

type JobStatusValue = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

interface JobStatusProps {
  value: JobStatusValue;
}

export class JobStatus extends ValueObject<JobStatusProps> {
  get value(): JobStatusValue { return this.props.value; }

  private constructor(props: JobStatusProps) { super(props); }

  public static draft(): JobStatus     { return new JobStatus({ value: 'DRAFT' }); }
  public static published(): JobStatus { return new JobStatus({ value: 'PUBLISHED' }); }
  public static closed(): JobStatus    { return new JobStatus({ value: 'CLOSED' }); }

  public static fromString(value: string): Result<JobStatus> {
    if (!['DRAFT', 'PUBLISHED', 'CLOSED'].includes(value)) {
      return Result.fail(`Invalid job status: ${value}`);
    }
    return Result.ok(new JobStatus({ value: value as JobStatusValue }));
  }

  public isDraft(): boolean     { return this.props.value === 'DRAFT'; }
  public isPublished(): boolean { return this.props.value === 'PUBLISHED'; }
  public isClosed(): boolean    { return this.props.value === 'CLOSED'; }

  public toString(): string { return this.props.value; }
}
