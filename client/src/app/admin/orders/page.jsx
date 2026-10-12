'use client';

import { patch, post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Badge, Button, PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useStoreCommerce } from '@/features/commerce/useStoreCommerce';
import { formatDateTime, formatPrice, fullName } from '@/lib/utils';

const KEY = ['admin', 'orders'];

/**
 * Store (WooCommerce) orders are mirrors: payments, cancellations and refunds
 * are done in WooCommerce and synced here. Only legacy LMS orders can be
 * marked paid or refunded from this page.
 */
export default function AdminOrdersPage() {
  const store = useStoreCommerce();
  const setStatus = useApiMutation(({ id, status }) => patch(EP.admin.orderStatus(id), { status }), { invalidate: [KEY] });
  const refund = useApiMutation((id) => post(EP.admin.orderRefund(id), { reason: prompt('Refund reason?') || undefined }), { invalidate: [KEY] });
  const resync = useApiMutation((wcOrderId) => post(EP.admin.wooSyncOrder(wcOrderId)), { invalidate: [KEY] });
  const reconcile = useApiMutation(() => post(EP.admin.wooReconcile, {}), { invalidate: [KEY] });

  return (
    <>
      <PageHeader
        title="Orders"
        description={store.enabled ? 'Store orders are managed in WooCommerce and synced here automatically.' : undefined}
        actions={
          store.enabled && (
            <Button variant="secondary" loading={reconcile.isPending} onClick={() => reconcile.mutate()}>
              Sync recent store orders
            </Button>
          )
        }
      />
      <ResourceList
        queryKey={KEY}
        endpoint={EP.admin.orders}
        dataKey="orders"
        searchPlaceholder="Order number (e.g. WC-1048)..."
        filters={[
          { name: 'status', label: 'Status', options: ['paid', 'pending', 'failed', 'cancelled', 'refunded'] },
          { name: 'source', label: 'Source', options: ['woocommerce', 'lms'] }
        ]}
        columns={[
          {
            key: 'order_number',
            header: 'Order',
            render: (o) => (
              <div>
                <span className="font-mono text-xs">{o.order_number}</span>
                <div className="mt-1">
                  <Badge tone={o.source === 'woocommerce' ? 'blue' : 'gray'}>{o.source === 'woocommerce' ? 'Store' : 'LMS'}</Badge>
                </div>
              </div>
            )
          },
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
          {
            key: 'items',
            header: 'Courses',
            render: (o) => (
              <div className="max-w-xs">
                <span className="line-clamp-2">{o.items?.map((i) => i.course_title).join(', ')}</span>
                {o.coupon_codes && <p className="text-xs text-slate-500">Coupon: {o.coupon_codes}</p>}
                {o.sync_note && <p className="text-xs text-amber-700">{o.sync_note}</p>}
              </div>
            )
          },
          { key: 'total_amount', header: 'Total', render: (o) => formatPrice(o.total_amount) },
          {
            key: 'status',
            header: 'Status',
            render: (o) => (
              <div>
                <StatusBadge status={o.status} />
                {o.woocommerce_status && <p className="mt-1 text-xs text-slate-500">Store: {o.woocommerce_status}</p>}
              </div>
            )
          },
          { key: 'created_at', header: 'Date', render: (o) => formatDateTime(o.created_at) },
          {
            key: 'actions',
            header: '',
            render: (o) =>
              o.source === 'woocommerce' ? (
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" loading={resync.isPending && resync.variables === o.woocommerce_order_id} onClick={() => resync.mutate(o.woocommerce_order_id)}>
                    Resync
                  </Button>
                </div>
              ) : (
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
