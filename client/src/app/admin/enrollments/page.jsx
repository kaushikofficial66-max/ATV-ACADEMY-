'use client';

import Link from 'next/link';
import { patch, post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, PageHeader, ProgressBar, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { formatDate, fullName } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const KEY = ['admin', 'enrollments'];

export default function AdminEnrollmentsPage() {
  const ask = useConfirm();
  const update = useApiMutation(({ id, status }) => patch(EP.admin.enrollment(id), { status }), { invalidate: [KEY] });
  const recalc = useApiMutation((id) => post(`${EP.admin.enrollment(id)}/recalculate`), { invalidate: [KEY] });

  return (
    <>
      <PageHeader title="Enrollments" />
      <ResourceList
        queryKey={KEY}
        endpoint={EP.admin.enrollments}
        dataKey="enrollments"
        searchPlaceholder="Student name or email..."
        filters={[{ name: 'status', label: 'Status', options: ['active', 'completed', 'cancelled', 'expired'] }]}
        columns={[
          {
            key: 'student',
            header: 'Student',
            render: (e) => (
              <div>
                <p className="font-medium text-slate-900">{fullName(e.student)}</p>
                <p className="text-xs text-slate-500">{e.student?.email}</p>
              </div>
            )
          },
          { key: 'course', header: 'Course', render: (e) => e.course?.title },
          {
            key: 'progress',
            header: 'Progress',
            render: (e) => (
              <div className="flex w-32 items-center gap-2">
                <ProgressBar value={e.completion_percentage} />
                <span className="text-xs">{Number(e.completion_percentage)}%</span>
              </div>
            )
          },
          { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
          {
            key: 'order',
            header: 'Order',
            render: (e) =>
              e.order ? (
                <Link href={`/admin/orders/${e.order.id}`} className="font-mono text-xs text-brand-700 hover:underline" onClick={(ev) => ev.stopPropagation()}>
                  {e.order.order_number}
                </Link>
              ) : (
                'Manual'
              )
          },
          { key: 'enrolled_at', header: 'Enrolled', render: (e) => formatDate(e.enrolled_at) },
          { key: 'expires_at', header: 'Access until', render: (e) => (e.expires_at ? formatDate(e.expires_at) : 'Lifetime') },
          {
            key: 'actions',
            header: '',
            render: (e) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => recalc.mutate(e.id)}>
                  Recalculate
                </Button>
                {e.status === 'active' && (
                  <Button size="sm" variant="ghost" onClick={async () => (await ask({ title: 'Cancel enrollment?', message: 'The student loses access to the course.', confirmLabel: 'Cancel enrollment', cancelLabel: 'Go back', tone: 'warning' })) && update.mutate({ id: e.id, status: 'cancelled' })}>
                    Cancel
                  </Button>
                )}
                {e.status === 'cancelled' && (
                  <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: e.id, status: 'active' })}>
                    Reactivate
                  </Button>
                )}
              </div>
            )
          }
        ]}
      />
    </>
  );
}
