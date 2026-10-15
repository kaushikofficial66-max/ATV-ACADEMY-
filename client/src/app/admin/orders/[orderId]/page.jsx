'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Badge, Button, Card, CardHeader, ProgressBar, StatusBadge } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { canMarkPaid, canRefund, isStoreOrder, useOrderActions } from '@/features/admin/useOrderActions';
import { assetUrl, formatDate, formatDateTime, formatPrice, fullName, humanize } from '@/lib/utils';

const SOURCE = { lms: ['LMS checkout', 'gray'], woocommerce: ['WooCommerce store', 'blue'], website: ['Website (antarikshtv.com)', 'green'] };

/** Label + value row used in the detail cards; empty values are skipped. */
function Row({ label, children, mono = false }) {
  if (children === null || children === undefined || children === '' || children === false) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={`min-w-0 break-words text-right text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{children}</dd>
    </div>
  );
}

const money = (value, currency) => formatPrice(value, currency);

/** What happened to the order, oldest first, built from the order, its payments and enrolments. */
const buildTimeline = ({ order, transactions, enrollments }) => {
  const events = [{ at: order.created_at, title: 'Order placed', tone: 'gray' }];
  for (const p of transactions) {
    if (p.payment_gateway !== 'manual') events.push({ at: p.created_at, title: `Payment started (${humanize(p.payment_gateway)})`, tone: 'gray' });
    if (p.status === 'success' && p.paid_at) events.push({ at: p.paid_at, title: `${p.payment_gateway === 'manual' ? 'Marked as paid manually' : 'Payment received'} - ${money(p.amount, p.currency)}`, tone: 'green' });
    if (p.status === 'failed') events.push({ at: p.updated_at, title: 'Payment failed', tone: 'red' });
  }
  for (const e of enrollments) events.push({ at: e.enrolled_at, title: `Enrolled in ${e.course?.title || 'course'}`, tone: 'green' });
  if (order.status === 'refunded') events.push({ at: order.updated_at, title: 'Order refunded - access removed', tone: 'amber' });
  if (order.status === 'cancelled') events.push({ at: order.updated_at, title: 'Order cancelled', tone: 'red' });
  if (order.woocommerce_modified_at) events.push({ at: order.woocommerce_modified_at, title: `Last changed in the store (${order.woocommerce_status || 'status'})`, tone: 'blue' });
  return events.filter((e) => e.at).sort((a, b) => new Date(a.at) - new Date(b.at));
};

const DOT = { gray: 'bg-slate-400', green: 'bg-emerald-500', red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-blue-500' };

export default function AdminOrderDetailPage({ params }) {
  const { orderId } = use(params);
  const actions = useOrderActions();
  const query = useQuery({ queryKey: ['admin', 'orders', orderId], queryFn: () => get(EP.admin.order(orderId)).then((r) => r.data) });

  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> Orders
      </Link>
      <QueryState query={query} loading={<Loader />}>
        {(data) => {
          const { order, user, transactions, enrollments, coupon_usages: couponUsages = [], staff = [], buyer_stats: stats } = data;
          const [sourceLabel, sourceTone] = SOURCE[order.source] || [humanize(order.source), 'gray'];
          const staffName = (id) => fullName(staff.find((s) => s.id === Number(id))) || `staff #${id}`;
          const lastPaid = transactions.find((t) => t.status === 'success');
          const discount = Number(order.discount_amount || 0);
          const timeline = buildTimeline({ order, transactions, enrollments });

          return (
            <>
              {/* Header */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="break-all font-mono text-lg font-semibold text-slate-900 sm:text-xl">{order.order_number}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={order.status} />
                    <Badge tone={sourceTone}>{sourceLabel}</Badge>
                    <span className="text-sm text-slate-500">Placed {formatDateTime(order.created_at)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {isStoreOrder(order) && (
                    <Button variant="secondary" size="sm" loading={actions.resyncing(order)} onClick={() => actions.resync(order)}>
                      <RefreshCw className="size-4" aria-hidden /> Resync from store
                    </Button>
                  )}
                  {canMarkPaid(order) && (
                    <Button size="sm" disabled={actions.busy} onClick={() => actions.markPaid(order)}>
                      Mark as paid
                    </Button>
                  )}
                  {canRefund(order) && (
                    <Button variant="danger" size="sm" disabled={actions.busy} onClick={() => actions.refund(order)}>
                      Refund order
                    </Button>
                  )}
                </div>
              </div>
              {order.sync_note && <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{order.sync_note}</p>}

              <div className="grid gap-6 lg:grid-cols-3">
                {/* Left: items, payments, timeline */}
                <div className="space-y-6 lg:col-span-2">
                  <Card>
                    <CardHeader title={`Items (${order.items.length})`} />
                    <ul className="divide-y divide-slate-100">
                      {order.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                          {item.course?.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={assetUrl(item.course.thumbnail_url)} alt="" className="h-12 w-20 shrink-0 rounded-md object-cover" />
                          ) : (
                            <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-brand-100 text-lg font-bold text-brand-700">{(item.course_title || '?').slice(0, 1)}</span>
                          )}
                          <div className="min-w-0 flex-1">
                            {item.course_id ? (
                              <Link href={`/admin/courses/${item.course_id}`} className="line-clamp-2 text-sm font-medium text-slate-900 hover:text-brand-700">
                                {item.course_title}
                              </Link>
                            ) : (
                              <p className="text-sm font-medium text-slate-900">{item.course_title}</p>
                            )}
                            {Number(item.discount_amount) > 0 && (
                              <p className="mt-0.5 text-xs text-slate-500">
                                Price {money(item.price, order.currency)} - discount {money(item.discount_amount, order.currency)}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-slate-900">{money(item.final_amount, order.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>

                  <Card>
                    <CardHeader title={`Payments (${transactions.length})`} description="Every payment attempt for this order, newest first." />
                    {!transactions.length ? (
                      <p className="px-5 py-6 text-sm text-slate-500">No payment has been recorded for this order.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {transactions.map((p) => {
                          const raw = p.raw_response || {};
                          const refund = raw.refund;
                          return (
                            <li key={p.id} className="px-4 py-4 sm:px-5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-900">{humanize(p.payment_gateway)}</span>
                                  {p.payment_method && <span className="text-sm text-slate-500">· {humanize(p.payment_method)}</span>}
                                  <StatusBadge status={p.status} />
                                </div>
                                <span className="text-sm font-semibold text-slate-900">{money(p.amount, p.currency)}</span>
                              </div>
                              <dl className="mt-1 divide-y divide-slate-50">
                                <Row label="Gateway order id" mono>{p.gateway_order_id}</Row>
                                <Row label="Transaction / payment id" mono>{p.gateway_payment_id}</Row>
                                <Row label="Started">{formatDateTime(p.created_at)}</Row>
                                <Row label="Paid at">{p.paid_at ? formatDateTime(p.paid_at) : null}</Row>
                                <Row label="Marked paid by">{raw.marked_paid_by ? staffName(raw.marked_paid_by) : null}</Row>
                                <Row label="Note">{raw.note}</Row>
                                {refund && (
                                  <Row label="Refund">
                                    {refund.manual
                                      ? `Manual refund${refund.by ? ` by ${staffName(refund.by)}` : ''}${refund.reason ? ` - ${refund.reason}` : ''}`
                                      : `${refund.id ? `Gateway refund ${refund.id}` : 'Gateway refund'}${refund.amount ? ` - ${money(refund.amount / 100, p.currency)}` : ''}`}
                                  </Row>
                                )}
                              </dl>
                              {Object.keys(raw).length > 0 && (
                                <details className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                                  <summary className="cursor-pointer font-medium text-slate-600">Raw gateway data</summary>
                                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-700">{JSON.stringify(raw, null, 2)}</pre>
                                </details>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Card>

                  <Card>
                    <CardHeader title="Timeline" />
                    <ol className="space-y-4 px-5 py-4">
                      {timeline.map((e, i) => (
                        <li key={`${e.title}-${i}`} className="relative flex gap-3">
                          <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[e.tone]}`} aria-hidden />
                          <div>
                            <p className="text-sm text-slate-900">{e.title}</p>
                            <p className="text-xs text-slate-500">{formatDateTime(e.at)}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </Card>
                </div>

                {/* Right: totals, customer, enrolments, store info */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader title="Summary" />
                    <dl className="divide-y divide-slate-50 px-5 py-2">
                      <Row label="Subtotal">{money(order.subtotal, order.currency)}</Row>
                      {discount > 0 && <Row label="Discount">- {money(discount, order.currency)}</Row>}
                      {Number(order.tax_amount) > 0 && <Row label="Tax">{money(order.tax_amount, order.currency)}</Row>}
                      <div className="flex items-center justify-between py-3 text-base font-semibold text-slate-900">
                        <dt>Total</dt>
                        <dd>{money(order.total_amount, order.currency)}</dd>
                      </div>
                      <Row label="Currency">{order.currency}</Row>
                      <Row label="Coupon">
                        {order.coupon ? (
                          <span>
                            <span className="font-mono">{order.coupon.code}</span> ({order.coupon.discount_type === 'percentage' ? `${Number(order.coupon.discount_value)}%` : money(order.coupon.discount_value, order.currency)})
                          </span>
                        ) : (
                          order.coupon_codes
                        )}
                      </Row>
                      {couponUsages.length > 0 && <Row label="Coupon saved">{money(couponUsages.reduce((n, c) => n + Number(c.discount_amount), 0), order.currency)}</Row>}
                      <Row label="Paid with">{lastPaid ? `${humanize(lastPaid.payment_gateway)}${lastPaid.payment_method ? ` · ${humanize(lastPaid.payment_method)}` : ''}` : null}</Row>
                    </dl>
                  </Card>

                  <Card>
                    <CardHeader title="Customer" />
                    <dl className="divide-y divide-slate-50 px-5 py-2">
                      <Row label="Name">{fullName(user)}</Row>
                      <Row label="Email">
                        <a href={`mailto:${user?.email}`} className="text-brand-700 hover:underline">
                          {user?.email}
                        </a>
                      </Row>
                      <Row label="Phone">{user?.phone}</Row>
                      <Row label="Account">{user?.status ? humanize(user.status) : null}</Row>
                      <Row label="Email verified">{user ? (user.email_verified_at ? formatDate(user.email_verified_at) : 'Not yet') : null}</Row>
                      <Row label="Customer since">{user?.created_at ? formatDate(user.created_at) : null}</Row>
                      <Row label="All orders">{stats ? `${stats.orders} (${stats.paid_orders} paid, ${money(stats.paid_amount, order.currency)})` : null}</Row>
                    </dl>
                  </Card>

                  <Card>
                    <CardHeader title="Enrolments from this order" />
                    {!enrollments.length ? (
                      <p className="px-5 py-5 text-sm text-slate-500">{order.status === 'paid' ? 'No enrolment found for this paid order.' : 'None - the student is enrolled once the order is paid.'}</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {enrollments.map((e) => (
                          <li key={e.id} className="space-y-2 px-5 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium text-slate-900">{e.course?.title}</p>
                              <StatusBadge status={e.status} />
                            </div>
                            <ProgressBar value={Number(e.completion_percentage || 0)} />
                            <p className="text-xs text-slate-500">
                              {Math.round(Number(e.completion_percentage || 0))}% complete · enrolled {formatDate(e.enrolled_at)}
                              {e.expires_at ? ` · access until ${formatDate(e.expires_at)}` : ' · lifetime access'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>

                  {(order.woocommerce_order_id || order.external_order_id || order.woocommerce_status) && (
                    <Card>
                      <CardHeader title="Store / website details" />
                      <dl className="divide-y divide-slate-50 px-5 py-2">
                        <Row label="Store order id" mono>{order.woocommerce_order_id}</Row>
                        <Row label="Store status">{order.woocommerce_status ? humanize(order.woocommerce_status) : null}</Row>
                        <Row label="Last changed in store">{order.woocommerce_modified_at ? formatDateTime(order.woocommerce_modified_at) : null}</Row>
                        <Row label="Website order id" mono>{order.external_order_id}</Row>
                      </dl>
                    </Card>
                  )}
                </div>
              </div>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
