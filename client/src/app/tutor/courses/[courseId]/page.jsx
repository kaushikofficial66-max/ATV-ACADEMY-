'use client';

import { use } from 'react';
import CourseDetails from '@/features/course-builder/CourseDetails';

export default function Page({ params }) {
  const { courseId } = use(params);
  return <CourseDetails role="tutor" courseId={courseId} />;
}
