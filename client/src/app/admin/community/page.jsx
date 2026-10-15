'use client';

import { patch } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Badge, Button, PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { formatDateTime, fullName } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const KEY = ['admin', 'community'];

export default function AdminCommunityPage() {
  const ask = useConfirm();
  const moderate = useApiMutation(({ id, status }) => patch(EP.admin.communityPostStatus(id), { status }), { invalidate: [KEY] });

  return (
    <>
      <PageHeader title="Community moderation" />
      <ResourceList
        queryKey={KEY}
        endpoint={EP.admin.communityPosts}
        dataKey="posts"
        searchPlaceholder="Search post content..."
        filters={[{ name: 'status', label: 'Status', options: ['published', 'pending', 'hidden', 'deleted'] }]}
        columns={[
          {
            key: 'author',
            header: 'Author',
            render: (p) => (
              <div>
                <p className="font-medium text-slate-900">{fullName(p.author)}</p>
                <p className="text-xs text-slate-500">{formatDateTime(p.created_at)}</p>
              </div>
            )
          },
          {
            key: 'content',
            header: 'Post',
            render: (p) => (
              <div className="max-w-md">
                {p.course && <Badge tone="blue">{p.course.title}</Badge>}
                <p className="line-clamp-3 text-sm">{p.content}</p>
              </div>
            )
          },
          { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
          {
            key: 'actions',
            header: '',
            render: (p) => (
              <div className="flex justify-end gap-1">
                {p.status !== 'published' && (
                  <Button size="sm" onClick={() => moderate.mutate({ id: p.id, status: 'published' })}>
                    Publish
                  </Button>
                )}
                {p.status !== 'hidden' && (
                  <Button size="sm" variant="ghost" onClick={() => moderate.mutate({ id: p.id, status: 'hidden' })}>
                    Hide
                  </Button>
                )}
                {p.status !== 'deleted' && (
                  <Button size="sm" variant="ghost" onClick={async () => (await ask({ title: 'Delete post?', message: 'This post will be removed from the community.', confirmLabel: 'Delete' })) && moderate.mutate({ id: p.id, status: 'deleted' })}>
                    Delete
                  </Button>
                )}
              </div>
            )
          }
        ]}
      />
    </>
  );
}
