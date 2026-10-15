'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { post, getErrorMessage } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { payWithRazorpay } from '@/features/commerce/razorpay';
import { formatDateTime, formatPrice } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const KEY = ['student', 'orders'];

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const ask = useConfirm();
  const cancel = useApiMutation((id) => post(EP.student.cancelOrder(id)), { invalidate: [KEY] });

  const retry = async (order) => {
    try {
      const res = await post(EP.student.retryPayment(order.id));
      await payWithRazorpay(res.data.payment);
      toast.success('Payment successful! You are now enrolled.');
      queryClient.invalidateQueries({ queryKey: ['student'] });
    } catch (err) {
      if (!err.dismissed) toast.error(getErrorMessage(err));
      queryClient.invalidateQueries({ queryKey: KEY });
    }
  };

  return (
    <>
      <PageHeader title="My orders" />
      <ResourceList
        queryKey={KEY}
        endpoint={EP.student.orders}
        dataKey="orders"
        search={false}
        filters={[{ name: 'status', label: 'Status', options: ['paid', 'pending', 'failed', 'cancelled', 'refunded'] }]}
        empty="You have not placed any orders yet."
        columns={[
          { key: 'order_number', header: 'Order' },
          { key: 'items', header: 'Courses', render: (o) => o.items?.map((i) => i.course_title).join(', ') },
          { key: 'total_amount', header: 'Total', render: (o) => formatPrice(o.total_amount) },
          { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
          { key: 'created_at', header: 'Date', render: (o) => formatDateTime(o.created_at) },
          {
            key: 'actions',
            header: '',
            render: (o) =>
              o.source === 'woocommerce' ? (
                o.store_order_url && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" href={o.store_order_url}>
                      View on store
                    </Button>
                  </div>
                )
              ) : (
                ['pending', 'failed'].includes(o.status) && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => retry(o)}>
                      Pay now
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => (await ask({ title: 'Cancel this order?', message: 'The order will be cancelled.', confirmLabel: 'Cancel order', cancelLabel: 'Keep order', tone: 'warning' })) && cancel.mutate(o.id)}>
                      Cancel
                    </Button>
                  </div>
                )
              )
          }
        ]}
      />
    </>
  );
}
