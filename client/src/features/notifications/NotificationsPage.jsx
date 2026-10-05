'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bell, Trash2 } from 'lucide-react';
import { Button, Card, PageHeader, Pagination } from '@/components/ui';
import { QueryState, EmptyState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { notificationsApi, notificationKeys } from './api';
import { cn, formatDateTime } from '@/lib/utils';

/** Full notification list - shared by every panel's /notifications page. */
export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const params = { page, limit: 20, ...(unreadOnly && { status: 'unread' }) };
  const query = useQuery({ queryKey: notificationKeys.list(params), queryFn: () => notificationsApi.list(params), placeholderData: keepPreviousData });
  const opts = { invalidate: [notificationKeys.all], silent: true };
  const markRead = useApiMutation(notificationsApi.markRead, opts);
  const markUnread = useApiMutation(notificationsApi.markUnread, opts);
  const remove = useApiMutation(notificationsApi.remove, opts);
  const markAll = useApiMutation(notificationsApi.markAllRead, { invalidate: [notificationKeys.all] });

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <Button variant="secondary" onClick={() => setUnreadOnly((v) => !v)}>
              {unreadOnly ? 'Show all' : 'Unread only'}
            </Button>
            <Button variant="secondary" loading={markAll.isPending} onClick={() => markAll.mutate()}>
              Mark all as read
            </Button>
          </>
        }
      />
      <Card>
        <QueryState query={query} loading={<Loader />}>
          {({ data, meta }) =>
            data.notifications.length === 0 ? (
              <EmptyState icon={Bell} title="You're all caught up" />
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {data.notifications.map((n) => (
                    <li key={n.id} className={cn('flex gap-4 px-5 py-4', !n.is_read && 'bg-brand-50/40')}>
                      <span className={cn('mt-2 size-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-brand-600')} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{n.title}</p>
                        <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                        <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.created_at)}</p>
                      </div>
                      <div className="flex shrink-0 items-start gap-1">
                        <Button size="sm" variant="ghost" onClick={() => (n.is_read ? markUnread : markRead).mutate(n.id)}>
                          {n.is_read ? 'Mark unread' : 'Mark read'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove.mutate(n.id)} aria-label="Delete notification">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <Pagination meta={meta} onPageChange={setPage} />
              </>
            )
          }
        </QueryState>
      </Card>
    </>
  );
}
