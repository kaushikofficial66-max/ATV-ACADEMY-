'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { get, post, patch } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Field, Input, PageHeader, Select, StatusBadge, Textarea } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { formatDate, formatPrice, fullName } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const KEY = ['admin', 'payouts'];

export default function AdminPayoutsPage() {
  const [creating, setCreating] = useState(false);
  const ask = useConfirm();
  const update = useApiMutation(({ id, ...body }) => patch(EP.admin.payout(id), body), { invalidate: [KEY] });

  return (
    <>
      <PageHeader
        title="Tutor payouts"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> New payout
          </Button>
        }
      />
      <ResourceList
        queryKey={KEY}
        endpoint={EP.admin.payouts}
        dataKey="payouts"
        search={false}
        filters={[{ name: 'status', label: 'Status', options: ['pending', 'processing', 'paid', 'failed', 'cancelled'] }]}
        columns={[
          { key: 'tutor', header: 'Tutor', render: (p) => fullName(p.tutor) },
          { key: 'amount', header: 'Amount', render: (p) => formatPrice(p.amount) },
          { key: 'payout_method', header: 'Method', render: (p) => p.payout_method || '-' },
          { key: 'transaction_reference', header: 'Reference', render: (p) => p.transaction_reference || '-' },
          { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
          { key: 'created_at', header: 'Date', render: (p) => formatDate(p.paid_at || p.created_at) },
          {
            key: 'actions',
            header: '',
            render: (p) =>
              ['pending', 'processing'].includes(p.status) && (
                <div className="flex justify-end gap-1">
                  <Button size="sm" onClick={async () => {
                      const r = await ask({ title: 'Mark payout as paid?', message: 'Record that this payout has been sent.', confirmLabel: 'Mark paid', tone: 'primary', input: { label: 'Transaction reference (optional)' } });
                      if (r) update.mutate({ id: p.id, status: 'paid', transaction_reference: r.value || undefined });
                    }}>
                    Mark paid
                  </Button>
                  <Button size="sm" variant="ghost" onClick={async () => (await ask({ title: 'Cancel payout?', message: 'This payout will be cancelled.', confirmLabel: 'Cancel payout', cancelLabel: 'Go back', tone: 'warning' })) && update.mutate({ id: p.id, status: 'cancelled' })}>
                    Cancel
                  </Button>
                </div>
              )
          }
        ]}
      />
      <Modal open={creating} onClose={() => setCreating(false)} title="New payout">
        {creating && <PayoutForm onDone={() => setCreating(false)} />}
      </Modal>
    </>
  );
}

function PayoutForm({ onDone }) {
  const [v, setV] = useState({ tutor_id: '', amount: '', payout_method: 'bank_transfer', transaction_reference: '', note: '', status: 'pending' });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const tutors = useQuery({ queryKey: ['admin', 'tutor-options'], queryFn: () => get(EP.admin.tutors, { status: 'active', limit: 100 }).then((r) => r.data.tutors) });
  const earnings = useQuery({
    queryKey: ['admin', 'tutor-earnings', v.tutor_id],
    queryFn: () => get(EP.admin.tutorEarnings(v.tutor_id)).then((r) => r.data),
    enabled: Boolean(v.tutor_id)
  });
  const save = useApiMutation(() => post(EP.admin.payouts, v), { invalidate: [KEY], onSuccess: onDone });
  const balance = earnings.data?.balance;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Tutor" htmlFor="po_tutor" required hint={balance !== undefined ? `Current balance: ${formatPrice(balance)}` : undefined}>
        <Select id="po_tutor" value={v.tutor_id} onChange={set('tutor_id')} required>
          <option value="">Select a tutor</option>
          {tutors.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {fullName(t)} ({t.email})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount (INR)" htmlFor="po_amount" required>
        <Input id="po_amount" type="number" min="1" step="0.01" value={v.amount} onChange={set('amount')} required />
      </Field>
      <Field label="Method" htmlFor="po_method">
        <Select id="po_method" value={v.payout_method} onChange={set('payout_method')}>
          <option value="bank_transfer">Bank transfer</option>
          <option value="upi">UPI</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Status" htmlFor="po_status">
        <Select id="po_status" value={v.status} onChange={set('status')}>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="paid">Paid</option>
        </Select>
      </Field>
      <Field label="Transaction reference" htmlFor="po_ref">
        <Input id="po_ref" value={v.transaction_reference} onChange={set('transaction_reference')} />
      </Field>
      <Field label="Note" htmlFor="po_note">
        <Textarea id="po_note" rows={2} value={v.note} onChange={set('note')} />
      </Field>
      <Button type="submit" loading={save.isPending}>
        Create payout
      </Button>
    </form>
  );
}
