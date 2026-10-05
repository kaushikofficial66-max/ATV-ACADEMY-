import { get, patch, del } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';

export const notificationsApi = {
  list: (params) => get(EP.notifications.list, params),
  unreadCount: () => get(EP.notifications.unreadCount),
  markRead: (id) => patch(EP.notifications.read(id)),
  markUnread: (id) => patch(EP.notifications.unread(id)),
  markAllRead: () => patch(EP.notifications.readAll),
  remove: (id) => del(EP.notifications.item(id))
};

export const notificationKeys = {
  all: ['notifications'],
  list: (params) => ['notifications', 'list', params],
  unread: ['notifications', 'unread']
};
