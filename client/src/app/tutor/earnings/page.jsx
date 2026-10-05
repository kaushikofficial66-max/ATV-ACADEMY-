'use client';

import { useQuery } from '@tanstack/react-query';
import { IndianRupee, Wallet, Clock, Percent } from 'lucide-react';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Card, CardHeader, DataTable, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { formatDate, formatPrice } from '@/lib/utils';

export default function TutorEarningsPage() {
  const query = useQuery({ queryKey: ['tutor', 'earnings'], queryFn: () => get(EP.tutor.earnings).then((r) => r.data) });
  return (
    <>
      <PageHeader title="Earnings" description="Your revenue share and payouts" />
      <QueryState query={query} loading={<Loader />}>
        {(e) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total earnings" value={formatPrice(e.total_earnings)} icon={IndianRupee} />
              <StatCard label="Paid out" value={formatPrice(e.total_paid_out)} icon={Wallet} />
              <StatCard label="Balance" value={formatPrice(e.balance)} icon={Clock} hint={e.pending_payouts ? `${formatPrice(e.pending_payouts)} pending payout` : undefined} />
              <StatCard label="Revenue share" value={`${e.share_percent}%`} icon={Percent} />
            </div>
            <Card>
              <CardHeader title="By course" />
              <DataTable
                rows={e.courses.map((c) => ({ ...c, course_id: c.course?.id }))}
                rowKey="course_id"
                empty="No sales yet."
                columns={[
                  { key: 'course', header: 'Course', render: (c) => c.course?.title },
                  { key: 'sales', header: 'Sales' },
                  { key: 'revenue', header: 'Revenue', render: (c) => formatPrice(c.revenue) },
                  { key: 'co_tutors', header: 'Co-tutors' },
                  { key: 'earnings', header: 'Your earnings', render: (c) => <span className="font-medium">{formatPrice(c.earnings)}</span> }
                ]}
              />
            </Card>
          </div>
        )}
      </QueryState>
      <h2 className="mb-3 mt-8 font-semibold text-slate-900">Payout history</h2>
      <ResourceList
        queryKey={['tutor', 'payouts']}
        endpoint={EP.tutor.payouts}
        dataKey="payouts"
        search={false}
        filters={[{ name: 'status', label: 'Status', options: ['pending', 'processing', 'paid', 'failed', 'cancelled'] }]}
        empty="No payouts yet."
        columns={[
          { key: 'amount', header: 'Amount', render: (p) => formatPrice(p.amount) },
          { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
          { key: 'reference', header: 'Reference', render: (p) => p.transaction_reference || '-' },
          { key: 'created_at', header: 'Date', render: (p) => formatDate(p.paid_at || p.created_at) }
        ]}
      />
    </>
  );
}
