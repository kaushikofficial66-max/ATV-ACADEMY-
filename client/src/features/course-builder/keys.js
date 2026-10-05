/** React Query keys for course management (tutor + admin share the backend paths). */
export const builderKeys = {
  all: (role) => [role, 'manage'],
  courses: (role) => [role, 'manage', 'courses'],
  course: (role, id) => [role, 'manage', 'course', String(id)],
  curriculum: (role, id) => [role, 'manage', 'course', String(id), 'curriculum'],
  videos: (role, id) => [role, 'manage', 'course', String(id), 'videos'],
  resources: (role, id) => [role, 'manage', 'course', String(id), 'resources'],
  quizzes: (role, id) => [role, 'manage', 'course', String(id), 'quizzes'],
  projects: (role, id) => [role, 'manage', 'course', String(id), 'projects'],
  submissions: (role) => [role, 'manage', 'submissions'],
  certificates: (role) => [role, 'manage', 'certificates'],
  liveClasses: (role) => [role, 'manage', 'live-classes']
};
