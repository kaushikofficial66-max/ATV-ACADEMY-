'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Package, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { get, post, del } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Badge, Button, Card, PageHeader, StatusBadge } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { EmptyState, QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useConfirm } from '@/components/feedback/ConfirmProvider';
import PlanForm, { PLANS_KEY } from '@/features/store-plans/PlanForm';
import { formatPrice } from '@/lib/utils';

/** Quick starts for the three Batch 2 plans (the admin then ticks the courses). */
const PRESETS = [
  { name: 'Essential', price: 7999, description: 'Beginners who want to learn professional video editing from zero.' },
  { name: 'Pro', price: 14999, description: 'Editors who also want to design thumbnails and posters.' },
  { name: 'Complete', price: 29999, description: 'The full creator and freelancer skill stack, start to finish.' }
];

const STORE_STATUS = { publish: ['green', 'Published'], draft: ['amber', 'Draft - publish it in WordPress'], pending: ['amber', 'Pending review'], private: ['gray', 'Private'], trash: ['red', 'In trash'] };

function StoreProduct({ plan, storeReady, onCreate, onSend, busy }) {
  const sp = plan.store_product;
  if (!plan.woocommerce_product_id) {
    return (
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        <p className="font-medium text-slate-800">Not in the store yet</p>
        <p className="mt-0.5 text-xs text-slate-500">Buyers can only purchase a plan once it has a store product.</p>
        <Button size="sm" className="mt-2" onClick={onCreate} loading={busy === 'create'} disabled={!storeReady} title={storeReady ? '' : 'Connect WooCommerce first (Settings)'}>
          Create in store
        </Button>
      </div>
    );
  }
  const [tone, label] = sp?.status ? STORE_STATUS[sp.status] || ['gray', sp.status] : ['gray', 'Linked'];
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-800">Store product #{plan.woocommerce_product_id}</span>
        {sp?.missing ? <Badge tone="red">Missing in the store</Badge> : <Badge tone={tone}>{label}</Badge>}
      </div>
      {sp?.name && <p className="mt-0.5 text-xs text-slate-500">{sp.name}{sp.price ? ` - store price ${formatPrice(sp.price)}` : ''}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {sp?.edit_url && (
          <a href={sp.edit_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-white">
            Open in WordPress <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
        <Button size="sm" variant="secondary" onClick={onSend} loading={busy === 'send'} disabled={!storeReady} title="Send this plan's price, description and picture to the store product">
          <RefreshCw className="size-3.5" aria-hidden /> Send to store
        </Button>
      </div>
    </div>
  );
}

export default function AdminStorePlansPage() {
  const ask = useConfirm();
  const [editing, setEditing] = useState(null); // { plan?, preset? }
  const [busy, setBusy] = useState(null); // `${planId}:create|send`
  const query = useQuery({ queryKey: PLANS_KEY, queryFn: () => get(EP.admin.storePlans).then((r) => r.data) });
  const storeReady = Boolean(query.data?.store_ready);

  const product = useApiMutation((id) => post(EP.admin.storePlanProduct(id)), { invalidate: [PLANS_KEY], onSuccess: () => setBusy(null) });
  const remove = useApiMutation((id) => del(EP.admin.storePlan(id)), { invalidate: [PLANS_KEY] });
  const run = (plan, kind) => {
    setBusy(`${plan.id}:${kind}`);
    product.mutate(plan.id, { onSettled: () => setBusy(null) });
  };

  return (
    <>
      <PageHeader
        title="Store plans"
        description="Sell ONE product that unlocks SEVERAL courses (for example Essential, Pro, Complete). Buyers pay on the website; this page decides which courses each plan gives."
        actions={
          <Button className="whitespace-nowrap" onClick={() => setEditing({})}>
            <Plus className="size-4" aria-hidden /> New plan
          </Button>
        }
      />

      <QueryState query={query} loading={<Loader />}>
        {({ plans }) => (
          <div className="space-y-4">
            {!storeReady && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                WooCommerce is not connected, so store products can&apos;t be created from here yet. Add the store address and REST API keys in{' '}
                <Link href="/admin/settings" className="font-medium underline">
                  Settings &rarr; WooCommerce
                </Link>
                . Plans can still be saved now.
              </p>
            )}

            {!plans.length ? (
              <Card className="p-6">
                <EmptyState
                  icon={Package}
                  title="No plans yet"
                  description="Start with one of the three Batch 2 plans, then tick the courses it unlocks."
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      {PRESETS.map((p) => (
                        <Button key={p.name} variant="secondary" onClick={() => setEditing({ preset: p })}>
                          {p.name} · {formatPrice(p.price)}
                        </Button>
                      ))}
                    </div>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan) => (
                  <Card key={plan.id} className="flex flex-col gap-4 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-slate-900">{plan.name}</h2>
                        <p className="font-mono text-xs text-slate-500">{plan.slug}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-slate-900">{formatPrice(plan.price)}</p>
                        <StatusBadge status={plan.status} />
                      </div>
                    </div>
                    {plan.description && <p className="text-sm text-slate-600">{plan.description}</p>}

                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Unlocks {plan.courses.length} course{plan.courses.length === 1 ? '' : 's'}</p>
                      <ul className="space-y-1.5">
                        {plan.courses.map((c) => (
                          <li key={c.course_id} className="flex items-center justify-between gap-3 rounded-lg bg-brand-50/60 px-3 py-1.5 text-sm">
                            <span className="min-w-0 truncate text-slate-800">{c.title}</span>
                            <span className="shrink-0 text-xs font-semibold text-brand-700">{c.share_percent}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {plan.upgrades?.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Upgrade prices</p>
                        <ul className="space-y-1">
                          {plan.upgrades.map((u) => (
                            <li key={u.from_plan_id} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                              <span>From {u.from_name}</span>
                              <span className="font-semibold text-slate-900">
                                {formatPrice(u.effective_price)}
                                <span className="ml-1 text-xs font-normal text-slate-500">{u.price === null ? '(automatic)' : '(custom)'}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <StoreProduct
                      plan={plan}
                      storeReady={storeReady}
                      busy={busy?.startsWith(`${plan.id}:`) ? busy.split(':')[1] : null}
                      onCreate={() => run(plan, 'create')}
                      onSend={() => run(plan, 'send')}
                    />
                    {plan.woocommerce_sync_error && <p className="text-xs text-red-600">{plan.woocommerce_sync_error}</p>}

                    <div className="mt-auto flex gap-2 border-t border-slate-100 pt-3">
                      <Button size="sm" variant="secondary" onClick={() => setEditing({ plan })}>
                        <Pencil className="size-3.5" aria-hidden /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () =>
                          (await ask({
                            title: 'Delete this plan?',
                            message: `"${plan.name}" will be removed. Orders already placed keep their courses. If the store product was created for this plan it is moved to the store's trash.`,
                            confirmLabel: 'Delete'
                          })) && remove.mutate(plan.id)
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden /> Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-500">
              Each course keeps working on its own too (a course linked to its own store product). A plan needs its own product, and the website plugin finds it by the plan name (essential / pro / complete).
            </p>
          </div>
        )}
      </QueryState>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.plan ? `Edit ${editing.plan.name}` : 'New store plan'} size="lg">
        {editing && <PlanForm key={editing.plan?.id ?? editing.preset?.name ?? 'new'} plan={editing.plan} preset={editing.preset} storeReady={storeReady} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
