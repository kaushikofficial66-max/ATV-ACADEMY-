'use client';

import { use } from 'react';
import ProjectManager from '@/features/course-builder/ProjectManager';

export default function Page({ params }) {
  const { courseId } = use(params);
  return <ProjectManager role="tutor" courseId={courseId} />;
}
