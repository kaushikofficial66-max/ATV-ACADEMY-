'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { patch, del } from '@/lib/api/client';
import { EP, manage } from '@/lib/api/endpoints';
import { Button, PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { builderKeys } from './keys';
import { assetUrl, formatDate, formatPrice, fullName } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const STATUSES = ['draft', 'pending', 'approved', 'published', 'rejected', 'archived'];

/** Course list for tutors (their courses) and admins (all courses, with approval). */
export default function CoursesTable({ role }) {
  const router = useRouter();
  const isAdmin = role === 'admin';
  const ask = useConfirm();
  const approve = useApiMutation(({ id, action }) => patch(EP.admin.courseApproval(id), { action }), { invalidate: [builderKeys.courses(role)] });

  const remove = useApiMutation((id) => del(manage(role).course(id)), { invalidate: [builderKeys.courses(role)] });
  const onDelete = async (c) => {
    const ok = await ask({
      title: `Delete "${c.title}"?`,
      message: 'The course, its modules, lectures, videos and files are permanently deleted. This cannot be undone. (Courses with students or orders cannot be deleted - archive them instead.)',
      confirmLabel: 'Delete course'
    });
    if (ok) remove.mutate(c.id);
  };

  return (
    <>
      <PageHeader
        title="Courses"
        description={isAdmin ? 'All courses on the platform' : 'Courses you teach'}
        actions={
          <Button href={`/${role}/courses/new`}>
            <Plus className="size-4" aria-hidden /> New course
          </Button>
        }
      />
      <ResourceList
        queryKey={builderKeys.courses(role)}
        endpoint={isAdmin ? EP.admin.courses : manage(role).courses}
        dataKey="courses"
        searchPlaceholder="Search courses..."
        filters={[{ name: 'status', label: 'Status', options: STATUSES }]}
        empty="No courses yet."
        columns={[
          {
            key: 'title',
            header: 'Course',
            render: (c) => (
              <div className="flex items-center gap-3">
                <Link href={`/${role}/courses/${c.id}`} tabIndex={-1} aria-hidden className="relative block h-12 w-20 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-brand-700 to-brand-500">
                  {c.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetUrl(c.thumbnail_url)} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-lg font-bold text-white/60">{(c.title || '?').slice(0, 1).toUpperCase()}</span>
                  )}
                </Link>
                <div className="min-w-0">
                  <Link href={`/${role}/courses/${c.id}`} className="font-medium text-slate-900 hover:text-brand-800">
                    {c.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {c.category?.name}
                    {isAdmin && c.tutors?.length ? ` · ${c.tutors.map(fullName).join(', ')}` : ''}
                  </p>
                </div>
              </div>
            )
          },
          { key: 'price', header: 'Price', render: (c) => formatPrice(c.effective_price ?? c.price) },
          { key: 'student_count', header: 'Students' },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          { key: 'updated_at', header: 'Updated', render: (c) => formatDate(c.updated_at) },
          {
            key: 'actions',
            header: '',
            render: (c) => (
              <div className="flex justify-end gap-2">
                {isAdmin && c.status === 'pending' && (
                  <>
                    <Button size="sm" onClick={() => approve.mutate({ id: c.id, action: 'publish' })}>
                      Approve & publish
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => (await ask({ title: 'Reject this course?', message: 'The course will not be published.', confirmLabel: 'Reject' })) && approve.mutate({ id: c.id, action: 'reject' })}>
                      Reject
                    </Button>
                  </>
                )}
                <Button size="sm" variant="secondary" onClick={() => router.push(`/${role}/courses/${c.id}/curriculum`)}>
                  Curriculum
                </Button>
                {(isAdmin || ['draft', 'rejected'].includes(c.status)) && (
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => onDelete(c)} loading={remove.isPending && remove.variables === c.id}>
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
