'use client';

import { use } from 'react';
import ResourcesManager from '@/features/course-builder/ResourcesManager';

export default function Page({ params }) {
  const { courseId } = use(params);
  return <ResourcesManager role="tutor" courseId={courseId} />;
}
