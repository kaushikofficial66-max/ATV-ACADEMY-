import CoursesTable from '@/features/course-builder/CoursesTable';

export const metadata = { title: 'Courses' };

export default function Page() {
  return <CoursesTable role="admin" />;
}
