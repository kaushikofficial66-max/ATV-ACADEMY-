'use client';

import { use } from 'react';
import CourseManageShell from '@/features/course-builder/CourseManageShell';

export default function CourseManageLayout({ children, params }) {
  const { courseId } = use(params);
  return (
    <CourseManageShell role="tutor" courseId={courseId}>
      {children}
    </CourseManageShell>
  );
}
