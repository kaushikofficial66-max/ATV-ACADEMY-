'use client';

import { Inbox, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { getErrorMessage } from '@/lib/api/client';

export function EmptyState({ title = 'Nothing here yet', description, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Icon className="mb-3 size-10 text-slate-300" aria-hidden />
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Could not load this data' }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <TriangleAlert className="mb-3 size-10 text-red-400" aria-hidden />
      <p className="font-medium text-slate-800">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">{getErrorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => onRetry()}>
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Renders loading / error / content for a React Query result.
 * <QueryState query={q}>{(data) => ...}</QueryState>
 */
export function QueryState({ query, children, loading }) {
  if (query.isPending) return loading || <div className="py-12 text-center text-sm text-slate-500">Loading...</div>;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  return children(query.data);
}
