import { PageHeader } from '@/components/ui';
import CourseForm from '@/features/course-builder/CourseForm';

export const metadata = { title: 'New course' };

export default function Page() {
  return (
    <>
      <PageHeader title="New course" description="Start with the basics - you can add the curriculum next." />
      <CourseForm role="admin" />
    </>
  );
}
