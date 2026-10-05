export const ROLES = { STUDENT: 'student', TUTOR: 'tutor', ADMIN: 'admin' };

/** Where each role lands after login. */
export const ROLE_HOME = { student: '/student', tutor: '/tutor', admin: '/admin' };

/** Badge colours for API statuses. */
export const STATUS_TONE = {
  active: 'green',
  published: 'green',
  approved: 'green',
  issued: 'green',
  paid: 'green',
  completed: 'green',
  ready: 'green',
  success: 'green',
  visible: 'green',
  pending: 'amber',
  pending_approval: 'amber',
  processing: 'amber',
  submitted: 'amber',
  under_review: 'amber',
  scheduled: 'blue',
  live: 'blue',
  in_progress: 'blue',
  project_unlocked: 'blue',
  draft: 'gray',
  inactive: 'gray',
  not_started: 'gray',
  archived: 'gray',
  unpublished: 'gray',
  rejected: 'red',
  failed: 'red',
  blocked: 'red',
  cancelled: 'red',
  revoked: 'red',
  refunded: 'red',
  expired: 'red',
  resubmission_required: 'red',
  hidden: 'red',
  deleted: 'red'
};

export const COURSE_LEVELS = ['beginner', 'intermediate', 'advanced', 'all'];

export const DEFAULT_PAGE_SIZE = 20;
