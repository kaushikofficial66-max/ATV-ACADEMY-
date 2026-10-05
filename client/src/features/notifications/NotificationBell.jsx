'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { notificationsApi, notificationKeys } from './api';
import { getSocket } from '@/lib/socket';

/** Bell with unread count; live updates arrive over socket.io. */
export default function NotificationBell({ href }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: notificationKeys.unread,
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 60 * 1000
  });
  const count = data?.data?.unread_count || 0;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onNotification = (n) => {
      toast(n.title, { description: n.message });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    };
    socket.on('notification', onNotification);
    return () => socket.off('notification', onNotification);
  }, [queryClient]);

  return (
    <Link href={href} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label={`Notifications (${count} unread)`}>
      <Bell className="size-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold leading-5 text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
