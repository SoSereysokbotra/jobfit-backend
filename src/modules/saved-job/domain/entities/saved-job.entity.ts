// src/modules/saved-job/domain/entities/saved-job.entity.ts
//
// A seeker's bookmarked job. A pure association (user ↔ job) with no behaviour of
// its own — uniqueness is enforced by the DB (@@unique([userId, jobId])). The id
// and createdAt are DB-generated, so they are optional on construction.

export class SavedJob {
  readonly id?: string;
  readonly userId: string;
  readonly jobId: string;
  readonly createdAt?: Date;

  constructor(props: {
    id?: string;
    userId: string;
    jobId: string;
    createdAt?: Date;
  }) {
    this.id = props.id;
    this.userId = props.userId;
    this.jobId = props.jobId;
    this.createdAt = props.createdAt;
  }

  static create(userId: string, jobId: string): SavedJob {
    return new SavedJob({ userId, jobId });
  }
}
