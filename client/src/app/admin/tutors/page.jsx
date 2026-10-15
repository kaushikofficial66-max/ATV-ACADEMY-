'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { patch } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Avatar, Button, PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import TutorInfoModal from '@/features/admin/TutorInfoModal';
import { formatDate, formatDateTime, fullName } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const KEY = ['admin', 'tutors'];

export default function AdminTutorsPage() {
  return (
    <Suspense>
      <TutorsList />
    </Suspense>
  );
}

function TutorsList() {
  const params = useSearchParams();
  const ask = useConfirm();
  const [infoId, setInfoId] = useState(null);
  const review = useApiMutation(({ id, action, reason }) => patch(EP.admin.tutorApproval(id), { action, reason }), { invalidate: [KEY, ['admin', 'dashboard']] });
  const setStatus = useApiMutation(({ id, status }) => patch(EP.admin.userStatus(id), { status }), { invalidate: [KEY] });

  return (
    <>
      <PageHeader title="Tutors" description="Approve tutor applications and manage tutor accounts" actions={<Button href="/admin/users" variant="secondary">Add tutor</Button>} />
      <ResourceList
        queryKey={KEY}
        endpoint={EP.admin.tutors}
        dataKey="tutors"
        searchPlaceholder="Name or email..."
        initialFilters={{ status: params.get('status') || '' }}
        filters={[{ name: 'status', label: 'Status', options: ['pending', 'active', 'inactive', 'blocked'] }]}
        columns={[
          {
            key: 'name',
            header: 'Tutor',
            render: (u) => (
              <div className="flex items-center gap-2">
                <Avatar user={u} size={32} />
                <div>
                  <p className="font-medium text-slate-900">{fullName(u)}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
              </div>
            )
          },
          { key: 'bio', header: 'About', render: (u) => <span className="line-clamp-2 max-w-xs text-xs">{u.profile?.bio || '-'}</span> },
          { key: 'course_count', header: 'Courses' },
          { key: 'student_count', header: 'Students' },
          { key: 'classes_taken', header: 'Classes taken', render: (u) => u.classes_taken ?? 0 },
          { key: 'last_login_at', header: 'Last login', render: (u) => (u.last_login_at ? formatDateTime(u.last_login_at) : 'Never') },
          { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
          { key: 'created_at', header: 'Applied', render: (u) => formatDate(u.created_at) },
          {
            key: 'actions',
            header: '',
            render: (u) =>
              u.status === 'pending' ? (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setInfoId(u.id)}>
                    More info
                  </Button>
                  <Button size="sm" onClick={() => review.mutate({ id: u.id, action: 'approve' })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                      const r = await ask({ title: 'Reject this application?', message: 'The applicant is told it was not approved.', confirmLabel: 'Reject', input: { label: 'Reason (sent to the applicant)' } });
                      if (r) review.mutate({ id: u.id, action: 'reject', reason: r.value || undefined });
                    }}>
                    Reject
                  </Button>
                </div>
              ) : (
                <div className="flex justify-end gap-1">
                  <Button size="sm" onClick={() => setInfoId(u.id)}>
                    More info
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: u.id, status: u.status === 'blocked' ? 'active' : 'blocked' })}>
                    {u.status === 'blocked' ? 'Unblock' : 'Block'}
                  </Button>
                </div>
              )
          }
        ]}
      />
      <TutorInfoModal tutorId={infoId} onClose={() => setInfoId(null)} />
    </>
  );
}
