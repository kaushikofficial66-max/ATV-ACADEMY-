'use client';

import { use } from 'react';
import CurriculumBuilder from '@/features/course-builder/CurriculumBuilder';

export default function Page({ params }) {
  const { courseId } = use(params);
  return <CurriculumBuilder role="tutor" courseId={courseId} />;
}
