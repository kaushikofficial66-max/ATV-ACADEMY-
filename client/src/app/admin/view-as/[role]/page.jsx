'use client';

import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import { toast } from 'sonner';
import { Eye } from 'lucide-react';
import { getErrorMessage } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Avatar, Button, PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useAuth } from '@/features/auth/AuthProvider';
import { fullName } from '@/lib/utils';

const ROLES = {
  student: { title: 'View as student', endpoint: EP.admin.students, dataKey: 'students', statuses: ['active', 'inactive', 'pending'] },
  tutor: { title: 'View as tutor', endpoint: EP.admin.tutors, dataKey: 'tutors', statuses: ['active', 'pending', 'inactive'] }
};

/**
 * Pick a student or tutor and open their panel exactly as they see it
 * (read-only, no password needed). "Exit preview" returns to the admin panel.
 */
export default function ViewAsPage({ params }) {
  const { role } = use(params);
  const { viewAs } = useAuth();
  const [opening, setOpening] = useState(null);
  const cfg = ROLES[role];
  if (!cfg) notFound();

  const open = async (u) => {
    setOpening(u.id);
    try {
      await viewAs(u.id);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setOpening(null);
    }
  };

  return (
    <>
      <PageHeader
        title={cfg.title}
        description={`Open the ${role} panel exactly as this ${role} sees it - their courses, progress and pages. Read-only: nothing you click changes their data.`}
      />
      <ResourceList
        key={role}
        queryKey={['admin', 'view-as', role]}
        endpoint={cfg.endpoint}
        dataKey={cfg.dataKey}
        searchPlaceholder="Name, email or phone..."
        filters={[{ name: 'status', label: 'Status', options: cfg.statuses }]}
        empty={`No ${role}s found.`}
        columns={[
          {
            key: 'name',
            header: role === 'tutor' ? 'Tutor' : 'Student',
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
          role === 'tutor'
            ? { key: 'course_count', header: 'Courses' }
            : { key: 'enrollment_count', header: 'Courses' },
          { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
          {
            key: 'actions',
            header: '',
            render: (u) => (
              <div className="flex justify-end">
                <Button size="sm" loading={opening === u.id} disabled={u.status === 'blocked' || (opening && opening !== u.id)} onClick={() => open(u)}>
                  <Eye className="size-4" aria-hidden /> View as {role}
                </Button>
              </div>
            )
          }
        ]}
      />
    </>
  );
}
