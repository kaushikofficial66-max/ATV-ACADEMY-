import { Suspense } from 'react';
import SubmissionsReview from '@/features/projects/SubmissionsReview';

export const metadata = { title: 'Project submissions' };

export default function Page() {
  return (
    <Suspense>
      <SubmissionsReview role="admin" />
    </Suspense>
  );
}
