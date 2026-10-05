'use client';

import { patch, post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { formatDateTime, formatPrice, fullName } from '@/lib/utils';

const KEY = ['admin', 'orders'];

export default function AdminOrdersPage() {
  const setStatus = useApiMutation(({ id, status }) => patch(EP.admin.orderStatus(id), { status }), { invalidate: [KEY] });
  const refund = useApiMutation((id) => post(EP.admin.orderRefund(id), { reason: prompt('Refund reason?') || undefined }), { invalidate: [KEY] });

  return (
    <>
      <PageHeader title="Orders" />
      <ResourceList
        queryKey={KEY}
        endpoint={EP.admin.orders}
        dataKey="orders"
        searchPlaceholder="Order number, name or email..."
        filters={[{ name: 'status', label: 'Status', options: ['paid', 'pending', 'failed', 'cancelled', 'refunded'] }]}
        columns={[
          { key: 'order_number', header: 'Order', render: (o) => <span className="font-mono text-xs">{o.order_number}</span> },
          {
            key: 'user',
            header: 'Customer',
            render: (o) => (
              <div>
                <p className="text-slate-900">{fullName(o.user)}</p>
                <p className="text-xs text-slate-500">{o.user?.email}</p>
              </div>
            )
          },
          { key: 'items', header: 'Courses', render: (o) => <span className="line-clamp-2 max-w-xs">{o.items?.map((i) => i.course_title).join(', ')}</span> },
          { key: 'total_amount', header: 'Total', render: (o) => formatPrice(o.total_amount) },
          { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
          { key: 'created_at', header: 'Date', render: (o) => formatDateTime(o.created_at) },
          {
            key: 'actions',
            header: '',
            render: (o) => (
              <div className="flex justify-end gap-1">
                {['pending', 'failed'].includes(o.status) && (
                  <Button size="sm" variant="ghost" onClick={() => confirm('Mark as paid and enroll the student?') && setStatus.mutate({ id: o.id, status: 'paid' })}>
                    Mark paid
                  </Button>
                )}
                {o.status === 'paid' && Number(o.total_amount) > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => confirm('Refund this order? Access to the courses is removed.') && refund.mutate(o.id)}>
                    Refund
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
