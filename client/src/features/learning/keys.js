/** React Query keys for the student learning area. */
export const learningKeys = {
  all: ['student', 'learning'],
  myCourses: (params) => ['student', 'learning', 'courses', params],
  player: (courseId) => ['student', 'learning', 'player', String(courseId)],
  lecture: (lectureId) => ['student', 'learning', 'lecture', String(lectureId)],
  locked: ['student', 'learning', 'locked'],
  lockedCourse: (courseId) => ['student', 'learning', 'locked', String(courseId)],
  quiz: (quizId) => ['student', 'learning', 'quiz', String(quizId)]
};
