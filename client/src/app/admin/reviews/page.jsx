'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { patch, del } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { formatDate, fullName } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const KEY = ['admin', 'reviews'];

export default function AdminReviewsPage() {
  return (
    <Suspense>
      <ReviewsList />
    </Suspense>
  );
}

function ReviewsList() {
  const ask = useConfirm();
  const params = useSearchParams();
  const moderate = useApiMutation(({ id, status }) => patch(EP.admin.reviewModerate(id), { status }), { invalidate: [KEY, ['admin', 'dashboard']] });
  const remove = useApiMutation((id) => del(`${EP.admin.reviews}/${id}`), { invalidate: [KEY] });

  return (
    <>
      <PageHeader title="Reviews" description="Approve reviews before they appear on course pages" />
      <ResourceList
        queryKey={KEY}
        endpoint={EP.admin.reviews}
        dataKey="reviews"
        searchPlaceholder="Search review text..."
        initialFilters={{ status: params.get('status') || '' }}
        filters={[
          { name: 'status', label: 'Status', options: ['pending', 'approved', 'rejected'] },
          { name: 'rating', label: 'Rating', options: [5, 4, 3, 2, 1].map((r) => ({ value: r, label: `${r} stars` })) }
        ]}
        columns={[
          { key: 'user', header: 'Student', render: (r) => fullName(r.user) },
          { key: 'course', header: 'Course', render: (r) => r.course?.title },
          {
            key: 'rating',
            header: 'Rating',
            render: (r) => (
              <span className="inline-flex items-center gap-1">
                <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden /> {r.rating}
              </span>
            )
          },
          { key: 'review', header: 'Review', render: (r) => <span className="line-clamp-3 max-w-md">{r.review || '-'}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'created_at', header: 'Date', render: (r) => formatDate(r.created_at) },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <div className="flex justify-end gap-1">
                {r.status !== 'approved' && (
                  <Button size="sm" onClick={() => moderate.mutate({ id: r.id, status: 'approved' })}>
                    Approve
                  </Button>
                )}
                {r.status !== 'rejected' && (
                  <Button size="sm" variant="ghost" onClick={async () => (await ask({ title: 'Reject this review?', message: 'It will not be shown publicly.', confirmLabel: 'Reject' })) && moderate.mutate({ id: r.id, status: 'rejected' })}>
                    Reject
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={async () => (await ask({ title: 'Delete review?', message: 'This review will be deleted.', confirmLabel: 'Delete' })) && remove.mutate(r.id)}>
                  Delete
                </Button>
              </div>
            )
          }
        ]}
      />
    </>
  );
}
