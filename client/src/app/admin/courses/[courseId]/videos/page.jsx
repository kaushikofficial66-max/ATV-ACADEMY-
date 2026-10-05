'use client';

import { use } from 'react';
import VideosManager from '@/features/course-builder/VideosManager';

export default function Page({ params }) {
  const { courseId } = use(params);
  return <VideosManager role="admin" courseId={courseId} />;
}
