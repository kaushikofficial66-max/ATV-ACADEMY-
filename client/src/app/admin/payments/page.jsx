'use client';

import { EP } from '@/lib/api/endpoints';
import { PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { formatDateTime, formatPrice, fullName, humanize } from '@/lib/utils';

export default function AdminPaymentsPage() {
  return (
    <>
      <PageHeader title="Payments" description="Razorpay transactions" />
      <ResourceList
        queryKey={['admin', 'payments']}
        endpoint={EP.admin.payments}
        dataKey="payments"
        searchPlaceholder="Payment / order id..."
        filters={[{ name: 'status', label: 'Status', options: ['created', 'pending', 'success', 'failed', 'refunded'] }]}
        columns={[
          { key: 'gateway_payment_id', header: 'Payment', render: (p) => <span className="font-mono text-xs">{p.gateway_payment_id || p.gateway_order_id}</span> },
          { key: 'order', header: 'Order', render: (p) => <span className="font-mono text-xs">{p.order?.order_number}</span> },
          { key: 'user', header: 'Customer', render: (p) => fullName(p.user) },
          { key: 'amount', header: 'Amount', render: (p) => formatPrice(p.amount) },
          { key: 'payment_method', header: 'Method', render: (p) => humanize(p.payment_method) || '-' },
          { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
          { key: 'created_at', header: 'Date', render: (p) => formatDateTime(p.paid_at || p.created_at) }
        ]}
      />
    </>
  );
}
