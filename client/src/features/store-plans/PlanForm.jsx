'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { get, post, put } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Field, Input, Select } from '@/components/ui';
import { useApiMutation } from '@/hooks/useApiMutation';
import { cn } from '@/lib/utils';

export const PLANS_KEY = ['admin', 'store-plans'];

/**
 * Create / edit a store plan: name, price, the courses it unlocks (with each course's share of the price)
 * and whether to create the WooCommerce product now.
 *   plan    existing plan (edit) or undefined (new)
 *   preset  { name, price, description } to start a new plan from
 */
export default function PlanForm({ plan, preset, storeReady, onDone }) {
  const courses = useQuery({
    queryKey: ['admin', 'courses', 'plan-options'],
    queryFn: () => get(EP.admin.courses, { limit: 100 }).then((r) => r.data.courses)
  });
  const [v, setV] = useState(() => ({
    name: plan?.name ?? preset?.name ?? '',
    price: plan?.price ?? preset?.price ?? '',
    description: plan?.description ?? preset?.description ?? '',
    status: plan?.status ?? 'active',
    woocommerce_product_id: plan?.woocommerce_product_id ?? ''
  }));
  const [picked, setPicked] = useState(() => (plan?.courses ?? []).map((c) => ({ course_id: c.course_id, revenue_weight: String(c.revenue_weight) })));
  // Upgrade prices: from a smaller plan to this one. Empty = automatic (this plan's price minus the smaller plan's price).
  const [upgrades, setUpgrades] = useState(() => Object.fromEntries((plan?.upgrades ?? []).map((u) => [u.from_plan_id, u.price === null ? '' : String(u.price)])));
  const [create, setCreate] = useState(Boolean(storeReady) && !plan?.woocommerce_product_id);
  const [query, setQuery] = useState('');
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  const isPicked = (id) => picked.some((p) => p.course_id === id);
  const toggle = (id) => setPicked((list) => (list.some((p) => p.course_id === id) ? list.filter((p) => p.course_id !== id) : [...list, { course_id: id, revenue_weight: '1' }]));
  const setWeight = (id, value) => setPicked((list) => list.map((p) => (p.course_id === id ? { ...p, revenue_weight: value } : p)));

  const totalWeight = picked.reduce((s, p) => s + (Number(p.revenue_weight) || 0), 0);
  const sharePct = (p) => (totalWeight > 0 ? Math.round(((Number(p.revenue_weight) || 0) / totalWeight) * 1000) / 10 : Math.round(1000 / Math.max(1, picked.length)) / 10);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (courses.data || []).filter((c) => !q || c.title.toLowerCase().includes(q));
  }, [courses.data, query]);

  const save = useApiMutation(
    () => {
      const body = {
        name: v.name,
        price: Number(v.price),
        description: v.description,
        status: v.status,
        courses: picked.map((p) => ({ course_id: p.course_id, revenue_weight: Number(p.revenue_weight) || 0 })),
        woocommerce_product_id: v.woocommerce_product_id === '' ? null : Number(v.woocommerce_product_id),
        create_store_product: create && !v.woocommerce_product_id,
        ...(plan?.upgrades?.length && { upgrade_prices: upgrades })
      };
      return plan ? put(EP.admin.storePlan(plan.id), body) : post(EP.admin.storePlans, body);
    },
    { invalidate: [PLANS_KEY], onSuccess: onDone }
  );

  const canSave = v.name.trim() && v.price !== '' && Number(v.price) >= 0 && picked.length > 0;

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Plan name" htmlFor="sp_name" required hint="Essential, Pro, Complete ... (also becomes the web address key: essential, pro, complete)">
        <Input id="sp_name" value={v.name} onChange={set('name')} required maxLength={120} />
      </Field>
      <Field label="Price (₹)" htmlFor="sp_price" required hint="What the buyer pays, incl. GST. Sent to the store product.">
        <Input id="sp_price" type="number" min="0" step="0.01" value={v.price} onChange={set('price')} required />
      </Field>
      <Field label="Short description" htmlFor="sp_desc" className="sm:col-span-2">
        <Input id="sp_desc" value={v.description} onChange={set('description')} maxLength={500} placeholder="Shown on the store product" />
      </Field>
      <Field label="Status" htmlFor="sp_status" hint="Inactive plans are hidden from the website.">
        <Select id="sp_status" value={v.status} onChange={set('status')}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>
      <Field label="Store product ID (optional)" htmlFor="sp_product" hint="Leave empty to create it for you, or enter an existing WooCommerce product id.">
        <Input id="sp_product" type="number" min="1" value={v.woocommerce_product_id} onChange={set('woocommerce_product_id')} disabled={Boolean(plan?.woocommerce_product_id)} />
      </Field>

      <div className="sm:col-span-2">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-700">
              Courses this plan unlocks <span className="text-red-500">*</span>
            </p>
            <p className="text-xs text-slate-500">The buyer is enrolled in every course ticked. The share decides how the plan price is split between them (course revenue and tutor earnings).</p>
          </div>
          <span className="text-xs font-medium text-slate-600">{picked.length} selected</span>
        </div>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search courses..." className="pl-9" aria-label="Search courses" />
        </div>
        <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {courses.isPending && <p className="p-4 text-sm text-slate-500">Loading courses...</p>}
          {courses.isError && <p className="p-4 text-sm text-red-600">Could not load the courses.</p>}
          {courses.isSuccess && !visible.length && <p className="p-4 text-sm text-slate-500">No courses match.</p>}
          {visible.map((c) => {
            const p = picked.find((x) => x.course_id === c.id);
            return (
              <div key={c.id} className={cn('flex items-center gap-3 px-3 py-2.5', p && 'bg-brand-50/60')}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={Boolean(p)} onChange={() => toggle(c.id)} className="size-4 shrink-0 accent-brand-700" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{c.title}</span>
                    {c.status !== 'published' && <span className="text-xs text-amber-700">{c.status}</span>}
                  </span>
                </label>
                {p && (
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-600">
                    share
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={p.revenue_weight}
                      onChange={(e) => setWeight(c.id, e.target.value)}
                      className="h-8 w-16 rounded-md border border-slate-300 px-2 text-right text-sm"
                      aria-label={`Share of ${c.title}`}
                    />
                    <span className="w-12 text-right font-semibold text-brand-700">{sharePct(p)}%</span>
                  </label>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">Tip: shares are relative. 12 and 5 means 70.6% and 29.4%. Use the same number for an equal split.</p>
      </div>

      {plan && (
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-slate-700">Upgrade prices</p>
          <p className="text-xs text-slate-500">
            A student who already has a smaller plan pays only the difference to reach this one (this plan&apos;s price minus the smaller plan&apos;s price). Type a custom price to override it.
          </p>
          {plan.upgrades?.length ? (
            <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {plan.upgrades.map((u) => {
                const auto = Math.max(0, (Number(v.price) || 0) - Number(u.from_price));
                return (
                  <div key={u.from_plan_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 text-slate-800">
                      From <strong>{u.from_name}</strong>
                      <span className="block text-xs text-slate-500">Automatic: ₹{auto.toLocaleString('en-IN')}</span>
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      Custom ₹
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={upgrades[u.from_plan_id] ?? ''}
                        onChange={(e) => setUpgrades((s) => ({ ...s, [u.from_plan_id]: e.target.value }))}
                        placeholder="auto"
                        className="h-9 w-28 rounded-md border border-slate-300 px-2 text-right text-sm"
                        aria-label={`Custom upgrade price from ${u.from_name}`}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              No smaller plan fits inside this one yet. A plan is an upgrade target when all the courses of a cheaper plan are also in it (for example Essential inside Pro).
            </p>
          )}
        </div>
      )}

      {!plan?.woocommerce_product_id && !v.woocommerce_product_id && (
        <label className={cn('flex items-start gap-2 text-sm sm:col-span-2', storeReady ? 'text-slate-700' : 'text-slate-400')}>
          <input type="checkbox" checked={create && storeReady} disabled={!storeReady} onChange={(e) => setCreate(e.target.checked)} className="mt-0.5 accent-brand-700" />
          <span>
            Create and publish the product in the WooCommerce store now
            {!storeReady && <span className="block text-xs">WooCommerce is not connected yet (Settings &rarr; WooCommerce: store address and REST API keys).</span>}
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" loading={save.isPending} disabled={!canSave}>
          {plan ? 'Save plan' : 'Create plan'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
