'use client';

import { patch, post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const KEY = ['admin', 'orders'];

/**
 * Admin order actions shared by the orders list and the order detail page.
 * Every action asks first. Store (WooCommerce) orders can only be re-synced; LMS orders can be marked paid or refunded.
 */
export function useOrderActions() {
  const ask = useConfirm();
  const setStatus = useApiMutation(({ id, status }) => patch(EP.admin.orderStatus(id), { status }), { invalidate: [KEY] });
  const refund = useApiMutation(({ id, reason }) => post(EP.admin.orderRefund(id), { reason }), { invalidate: [KEY] });
  const resync = useApiMutation((wcOrderId) => post(EP.admin.wooSyncOrder(wcOrderId)), { invalidate: [KEY] });
  const reconcile = useApiMutation(() => post(EP.admin.wooReconcile, {}), { invalidate: [KEY] });

  return {
    markPaid: async (order) => {
      const ok = await ask({
        title: 'Mark as paid?',
        message: 'The order will be marked as paid and the student enrolled.',
        confirmLabel: 'Mark paid',
        tone: 'primary'
      });
      if (ok) setStatus.mutate({ id: order.id, status: 'paid' });
    },
    refund: async (order) => {
      const r = await ask({
        title: 'Refund this order?',
        message: 'Access to the courses is removed.',
        confirmLabel: 'Refund',
        tone: 'warning',
        input: { label: 'Reason (optional)' }
      });
      if (r) refund.mutate({ id: order.id, reason: r.value || undefined });
    },
    resync: (order) => resync.mutate(order.woocommerce_order_id),
    reconcile: () => reconcile.mutate(),
    resyncing: (order) => resync.isPending && resync.variables === order.woocommerce_order_id,
    reconciling: reconcile.isPending,
    busy: setStatus.isPending || refund.isPending
  };
}

export const canMarkPaid = (o) => o.source !== 'woocommerce' && ['pending', 'failed'].includes(o.status);
export const canRefund = (o) => o.source !== 'woocommerce' && o.status === 'paid' && Number(o.total_amount) > 0;
export const isStoreOrder = (o) => o.source === 'woocommerce';
