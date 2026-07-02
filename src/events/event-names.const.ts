export const EVENT_NAMES = {
  // Job events
  JOB_PUBLISHED: 'job.published',
  JOB_CLOSED: 'job.closed',
  JOB_UPDATED: 'job.updated',
  JOB_CREATED: 'job.created',

  // Application events
  APPLICATION_SUBMITTED: 'application.submitted',
  APPLICATION_STATUS_CHANGED: 'application.status_changed',
  APPLICATION_WITHDRAWN: 'application.withdrawn',

  // User / Profile events
  USER_REGISTERED: 'user.registered',
  USER_PROFILE_UPDATED: 'user.profile_updated',

  // Resume events
  RESUME_UPLOADED: 'resume.uploaded',
  RESUME_PARSED: 'resume.parsed',

  // Matching events
  MATCH_SCORES_RECOMPUTED: 'matching.scores_recomputed',

  // Notification events
  NOTIFICATION_EMAIL_REQUESTED: 'notification.email_requested',
  NOTIFICATION_IN_APP_CREATED: 'notification.in_app_created',
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];
