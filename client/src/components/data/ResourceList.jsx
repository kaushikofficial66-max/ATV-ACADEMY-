'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { get } from '@/lib/api/client';
import { Card, DataTable, Input, Pagination, Select } from '@/components/ui';
import { ErrorState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useDebounce } from '@/hooks/useDebounce';
import { humanize } from '@/lib/utils';
import { DEFAULT_PAGE_SIZE } from '@/config/constants';

/**
 * Paginated, filterable table for any list endpoint returning
 * { data: { [dataKey]: rows }, meta }.
 *
 * filters: [{ name, label, options: ['a', 'b'] | [{ value, label }] }]
 * Mutations should invalidate `queryKey` to refresh the list.
 */
export default function ResourceList({
  queryKey,
  endpoint,
  dataKey,
  columns,
  filters = [],
  search = true,
  searchPlaceholder = 'Search...',
  params = {},
  initialFilters = {},
  empty,
  toolbar,
  onRowClick,
  rowKey,
  pageSize = DEFAULT_PAGE_SIZE,
  renderAbove
}) {
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const [values, setValues] = useState(initialFilters);
  const debounced = useDebounce(term);

  const queryParams = { page, limit: pageSize, ...params, ...clean(values), ...(debounced ? { search: debounced } : {}) };
  const query = useQuery({
    queryKey: [...queryKey, queryParams],
    queryFn: () => get(endpoint, queryParams),
    placeholderData: keepPreviousData
  });

  const rows = query.data ? pickRows(query.data.data, dataKey) : [];
  const setFilter = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setPage(1);
  };

  return (
    <Card>
      {(search || filters.length > 0 || toolbar) && (
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          {search && (
            <div className="relative lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="pl-9"
                aria-label="Search"
              />
            </div>
          )}
          {filters.map((f) => (
            <Select key={f.name} value={values[f.name] ?? ''} onChange={(e) => setFilter(f.name, e.target.value)} className="lg:w-48" aria-label={f.label}>
              <option value="">{f.label}: all</option>
              {f.options.map((o) => {
                const opt = typeof o === 'object' ? o : { value: o, label: humanize(o) };
                return (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                );
              })}
            </Select>
          ))}
          {toolbar && <div className="flex flex-wrap gap-2 lg:ml-auto">{toolbar}</div>}
        </div>
      )}
      {renderAbove?.(query.data?.data)}
      {query.isPending ? (
        <Loader />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <>
          <div className={query.isPlaceholderData ? 'opacity-60' : undefined}>
            <DataTable columns={columns} rows={rows} empty={empty} onRowClick={onRowClick} rowKey={rowKey} />
          </div>
          <Pagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}

const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null));

/** Rows from `data[dataKey]`, or the first array found in `data`. */
const pickRows = (data, dataKey) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (dataKey) return data[dataKey] || [];
  return Object.values(data).find(Array.isArray) || [];
};
