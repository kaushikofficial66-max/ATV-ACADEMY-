'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { get, post, downloadFile } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, DataTable, Input, PageHeader, Pagination, StatCard, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { cn, formatDateTime, fullName, humanize } from '@/lib/utils';

const TYPES = ['student', 'tutor', 'course', 'sales'];

export default function AdminReportsPage() {
  const [type, setType] = useState('sales');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const filters = { ...(from && { from }), ...(to && { to }) };
  const params = { ...filters, page, limit: 50 };
  const query = useQuery({ queryKey: ['admin', 'report', type, params], queryFn: () => get(EP.admin.report(type), params), placeholderData: keepPreviousData });
  const exportCsv = useApiMutation(() => post(EP.admin.reportExport(type), { filters }), {
    invalidate: [['admin', 'report-exports']],
    onSuccess: (res) => downloadFile(`${EP.admin.reportExports}/${res.data.export.id}/download`, `${type}-report.csv`)
  });

  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          <Button loading={exportCsv.isPending} onClick={() => exportCsv.mutate()}>
            <Download className="size-4" aria-hidden /> Export CSV
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setPage(1);
              }}
              className={cn('rounded-md px-3 py-1 text-sm', type === t ? 'bg-brand-700 text-white' : 'text-slate-600')}
            >
              {humanize(t)}
            </button>
          ))}
        </div>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="From" />
        <span className="text-sm text-slate-500">to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="To" />
      </div>
      <QueryState query={query} loading={<Loader />}>
        {({ data, meta }) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(data.summary || {})
                .filter(([, v]) => typeof v !== 'object')
                .map(([k, v]) => (
                  <StatCard key={k} label={humanize(k)} value={v} />
                ))}
            </div>
            <Card>
              <DataTable
                rows={data.rows.map((r, i) => ({ ...r, __key: `${page}-${i}` }))}
                rowKey="__key"
                columns={data.columns.map((c) => ({ key: c.key, header: c.label, render: (r) => String(r[c.key] ?? '') }))}
              />
              <Pagination meta={meta} onPageChange={setPage} />
            </Card>
          </div>
        )}
      </QueryState>
      <h2 className="mb-3 mt-8 font-semibold text-slate-900">Previous exports</h2>
      <ResourceList
        queryKey={['admin', 'report-exports']}
        endpoint={EP.admin.reportExports}
        dataKey="exports"
        search={false}
        columns={[
          { key: 'report_type', header: 'Report', render: (x) => humanize(x.report_type) },
          { key: 'generator', header: 'By', render: (x) => fullName(x.generator) },
          { key: 'status', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
          { key: 'created_at', header: 'Date', render: (x) => formatDateTime(x.created_at) },
          {
            key: 'download',
            header: '',
            render: (x) =>
              x.status === 'completed' && (
                <Button size="sm" variant="ghost" onClick={() => downloadFile(`${EP.admin.reportExports}/${x.id}/download`, `${x.report_type}-report.csv`)}>
                  Download
                </Button>
              )
          }
        ]}
      />
    </>
  );
}
