'use client';

import { useRouter } from 'next/navigation';
import { Badge, Button, PageHeader, StatusBadge } from '@/components/ui';
import { EP } from '@/lib/api/endpoints';
import ResourceList from '@/components/data/ResourceList';
import { useStoreCommerce } from '@/features/commerce/useStoreCommerce';
import { canMarkPaid, canRefund, isStoreOrder, useOrderActions } from '@/features/admin/useOrderActions';
import { formatDateTime, formatPrice, fullName, humanize } from '@/lib/utils';

const KEY = ['admin', 'orders'];
const SOURCE_BADGE = { woocommerce: ['Store', 'blue'], website: ['Website', 'green'], lms: ['LMS', 'gray'] };

/** The payment that counts for a row: the successful one, else the latest attempt. */
const mainPayment = (o) => o.payments?.find((p) => p.status === 'success') || o.payments?.[0];

/**
 * Store (WooCommerce) orders are mirrors: payments, cancellations and refunds
 * are done in WooCommerce and synced here. Only legacy LMS orders can be
 * marked paid or refunded. Click an order to see everything about it.
 */
export default function AdminOrdersPage() {
  const router = useRouter();
  const store = useStoreCommerce();
  const actions = useOrderActions();

  return (
    <>
      <PageHeader
        title="Orders"
        description={store.enabled ? 'Store orders are managed in WooCommerce and synced here automatically. Click an order for full details.' : 'Click an order for full details.'}
        actions={
          store.enabled && (
            <Button variant="secondary" loading={actions.reconciling} onClick={actions.reconcile}>
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
        onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
        filters={[
          { name: 'status', label: 'Status', options: ['paid', 'pending', 'failed', 'cancelled', 'refunded'] },
          { name: 'source', label: 'Source', options: ['woocommerce', 'website', 'lms'] }
        ]}
        columns={[
          {
            key: 'order_number',
            header: 'Order',
            render: (o) => {
              const [label, tone] = SOURCE_BADGE[o.source] || [humanize(o.source), 'gray'];
              return (
                <div>
                  <span className="font-mono text-xs">{o.order_number}</span>
                  <div className="mt-1">
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                </div>
              );
            }
          },
          {
            key: 'user',
            header: 'Customer',
            render: (o) => (
              <div>
                <p className="text-slate-900">{fullName(o.user)}</p>
                <p className="text-xs text-slate-500">{o.user?.email}</p>
                {o.user?.phone && <p className="text-xs text-slate-500">{o.user.phone}</p>}
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
            key: 'payment',
            header: 'Payment',
            render: (o) => {
              const p = mainPayment(o);
              if (!p) return <span className="text-slate-400">-</span>;
              return (
                <div className="max-w-[11rem]">
                  <p className="text-slate-900">
                    {humanize(p.payment_gateway || 'payment')}
                    {p.payment_method ? ` · ${humanize(p.payment_method)}` : ''}
                  </p>
                  {p.gateway_payment_id && <p className="truncate font-mono text-[11px] text-slate-500">{p.gateway_payment_id}</p>}
                </div>
              );
            }
          },
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
            render: (o) => (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="secondary" href={`/admin/orders/${o.id}`}>
                  View
                </Button>
                {isStoreOrder(o) && (
                  <Button size="sm" variant="ghost" loading={actions.resyncing(o)} onClick={() => actions.resync(o)}>
                    Resync
                  </Button>
                )}
                {canMarkPaid(o) && (
                  <Button size="sm" variant="ghost" onClick={() => actions.markPaid(o)}>
                    Mark paid
                  </Button>
                )}
                {canRefund(o) && (
                  <Button size="sm" variant="ghost" onClick={() => actions.refund(o)}>
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
