'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { post, put, patch, del } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Field, Input, PageHeader, Select, StatusBadge } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { formatDate, formatPrice } from '@/lib/utils';

const KEY = ['admin', 'coupons'];
const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export default function AdminCouponsPage() {
  const [editing, setEditing] = useState(null);
  const toggle = useApiMutation((c) => patch(EP.admin.couponStatus(c.id), { status: c.status === 'active' ? 'inactive' : 'active' }), { invalidate: [KEY] });
  const remove = useApiMutation((id) => del(EP.admin.coupon(id)), { invalidate: [KEY] });

  return (
    <>
      <PageHeader
        title="Coupons"
        actions={
          <Button onClick={() => setEditing({})}>
            <Plus className="size-4" aria-hidden /> New coupon
          </Button>
        }
      />
      <ResourceList
        queryKey={KEY}
        endpoint={EP.admin.coupons}
        dataKey="coupons"
        searchPlaceholder="Coupon code..."
        filters={[{ name: 'status', label: 'Status', options: ['active', 'inactive'] }]}
        onRowClick={setEditing}
        columns={[
          { key: 'code', header: 'Code', render: (c) => <span className="font-mono font-medium">{c.code}</span> },
          { key: 'discount', header: 'Discount', render: (c) => (c.discount_type === 'percentage' ? `${Number(c.discount_value)}%` : formatPrice(c.discount_value)) },
          { key: 'usage', header: 'Used', render: (c) => `${c.usage_count}${c.usage_limit ? ` / ${c.usage_limit}` : ''}` },
          { key: 'expires_at', header: 'Expires', render: (c) => formatDate(c.expires_at) },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          {
            key: 'actions',
            header: '',
            render: (c) => (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" onClick={() => toggle.mutate(c)}>
                  {c.status === 'active' ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${c.code}?`) && remove.mutate(c.id)}>
                  Delete
                </Button>
              </div>
            )
          }
        ]}
      />
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.code}` : 'New coupon'} size="lg">
        {editing && <CouponForm coupon={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function CouponForm({ coupon, onDone }) {
  const [v, setV] = useState({
    code: coupon.code || '',
    description: coupon.description || '',
    discount_type: coupon.discount_type || 'percentage',
    discount_value: coupon.discount_value ?? '',
    minimum_order_amount: coupon.minimum_order_amount ?? '',
    maximum_discount: coupon.maximum_discount ?? '',
    usage_limit: coupon.usage_limit ?? '',
    start_at: toDateInput(coupon.start_at),
    expires_at: toDateInput(coupon.expires_at),
    status: coupon.status || 'active'
  });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const save = useApiMutation(
    () => {
      const body = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val === '' ? null : val]));
      if (!body.start_at) delete body.start_at;
      if (coupon.id) delete body.code;
      return coupon.id ? put(EP.admin.coupon(coupon.id), body) : post(EP.admin.coupons, body);
    },
    { invalidate: [KEY], onSuccess: onDone }
  );

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Code" htmlFor="cp_code" required>
        <Input id="cp_code" value={v.code} onChange={(e) => setV((s) => ({ ...s, code: e.target.value.toUpperCase() }))} disabled={Boolean(coupon.id)} required />
      </Field>
      <Field label="Description" htmlFor="cp_desc">
        <Input id="cp_desc" value={v.description} onChange={set('description')} />
      </Field>
      <Field label="Type" htmlFor="cp_type">
        <Select id="cp_type" value={v.discount_type} onChange={set('discount_type')}>
          <option value="percentage">Percentage</option>
          <option value="fixed">Fixed amount (INR)</option>
        </Select>
      </Field>
      <Field label="Value" htmlFor="cp_value" required>
        <Input id="cp_value" type="number" min="0" step="0.01" value={v.discount_value} onChange={set('discount_value')} required />
      </Field>
      <Field label="Minimum order (INR)" htmlFor="cp_min">
        <Input id="cp_min" type="number" min="0" value={v.minimum_order_amount} onChange={set('minimum_order_amount')} />
      </Field>
      <Field label="Maximum discount (INR)" htmlFor="cp_max">
        <Input id="cp_max" type="number" min="0" value={v.maximum_discount} onChange={set('maximum_discount')} />
      </Field>
      <Field label="Usage limit" htmlFor="cp_limit" hint="Empty for unlimited">
        <Input id="cp_limit" type="number" min="1" value={v.usage_limit} onChange={set('usage_limit')} />
      </Field>
      <Field label="Status" htmlFor="cp_status">
        <Select id="cp_status" value={v.status} onChange={set('status')}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>
      <Field label="Starts" htmlFor="cp_start">
        <Input id="cp_start" type="date" value={v.start_at} onChange={set('start_at')} />
      </Field>
      <Field label="Expires" htmlFor="cp_end" required>
        <Input id="cp_end" type="date" value={v.expires_at} onChange={set('expires_at')} required />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={save.isPending}>
          Save coupon
        </Button>
      </div>
    </form>
  );
}
