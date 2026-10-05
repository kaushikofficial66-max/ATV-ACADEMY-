'use client';

import { use } from 'react';
import QuizzesManager from '@/features/course-builder/QuizzesManager';

export default function Page({ params }) {
  const { courseId } = use(params);
  return <QuizzesManager role="admin" courseId={courseId} />;
}
