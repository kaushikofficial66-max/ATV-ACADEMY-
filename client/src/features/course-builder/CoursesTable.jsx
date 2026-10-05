'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { patch } from '@/lib/api/client';
import { EP, manage } from '@/lib/api/endpoints';
import { Button, PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { builderKeys } from './keys';
import { formatDate, formatPrice, fullName } from '@/lib/utils';

const STATUSES = ['draft', 'pending', 'approved', 'published', 'rejected', 'archived'];

/** Course list for tutors (their courses) and admins (all courses, with approval). */
export default function CoursesTable({ role }) {
  const router = useRouter();
  const isAdmin = role === 'admin';
  const approve = useApiMutation(({ id, action }) => patch(EP.admin.courseApproval(id), { action }), { invalidate: [builderKeys.courses(role)] });

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
              <div>
                <Link href={`/${role}/courses/${c.id}`} className="font-medium text-slate-900 hover:text-brand-800">
                  {c.title}
                </Link>
                <p className="text-xs text-slate-500">
                  {c.category?.name}
                  {isAdmin && c.tutors?.length ? ` · ${c.tutors.map(fullName).join(', ')}` : ''}
                </p>
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
                    <Button size="sm" variant="ghost" onClick={() => approve.mutate({ id: c.id, action: 'reject' })}>
                      Reject
                    </Button>
                  </>
                )}
                <Button size="sm" variant="secondary" onClick={() => router.push(`/${role}/courses/${c.id}/curriculum`)}>
                  Curriculum
                </Button>
              </div>
            )
          }
        ]}
      />
    </>
  );
}
