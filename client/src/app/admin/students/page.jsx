'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, patch, post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Avatar, Badge, Button, Field, PageHeader, Select, StatusBadge } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import StudentInfoModal from '@/features/admin/StudentInfoModal';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { formatDate, formatPrice, fullName } from '@/lib/utils';

const KEY = ['admin', 'students'];

export default function AdminStudentsPage() {
  const setStatus = useApiMutation(({ id, status }) => patch(EP.admin.userStatus(id), { status }), { invalidate: [KEY] });
  const resetPassword = useApiMutation((id) => post(`${EP.admin.user(id)}/send-password-reset`));
  const [enrolling, setEnrolling] = useState(null);
  const [infoId, setInfoId] = useState(null);

  return (
    <>
      <PageHeader title="Students" actions={<Button href="/admin/users" variant="secondary">Add user</Button>} />
      <ResourceList
        queryKey={KEY}
        endpoint={EP.admin.students}
        dataKey="students"
        searchPlaceholder="Name, email or phone..."
        filters={[
          { name: 'status', label: 'Status', options: ['active', 'inactive', 'blocked', 'pending'] },
          { name: 'verified', label: 'Email', options: [{ value: 'true', label: 'Verified' }, { value: 'false', label: 'Not verified' }] }
        ]}
        columns={[
          {
            key: 'name',
            header: 'Student',
            render: (u) => (
              <div className="flex items-center gap-2">
                <Avatar user={u} size={32} />
                <div>
                  <p className="font-medium text-slate-900">{fullName(u)}</p>
                  <p className="text-xs text-slate-500">
                    {u.email} {!u.email_verified_at && <Badge tone="amber">unverified</Badge>}
                  </p>
                </div>
              </div>
            )
          },
          { key: 'enrollment_count', header: 'Courses', render: (u) => `${u.enrollment_count} (${u.completed_count} done)` },
          { key: 'total_spent', header: 'Spent', render: (u) => formatPrice(u.total_spent) },
          { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
          { key: 'created_at', header: 'Joined', render: (u) => formatDate(u.created_at) },
          {
            key: 'actions',
            header: '',
            render: (u) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" onClick={() => setInfoId(u.id)}>
                  More info
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEnrolling(u)}>
                  Enroll
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: u.id, status: u.status === 'blocked' ? 'active' : 'blocked' })}>
                  {u.status === 'blocked' ? 'Unblock' : 'Block'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => resetPassword.mutate(u.id)}>
                  Reset password
                </Button>
              </div>
            )
          }
        ]}
      />
      <StudentInfoModal studentId={infoId} onClose={() => setInfoId(null)} />
      <Modal open={Boolean(enrolling)} onClose={() => setEnrolling(null)} title={`Enroll ${fullName(enrolling)}`} description="Gives free access without payment.">
        {enrolling && <EnrollForm student={enrolling} onDone={() => setEnrolling(null)} />}
      </Modal>
    </>
  );
}

function EnrollForm({ student, onDone }) {
  const [courseId, setCourseId] = useState('');
  const courses = useQuery({ queryKey: ['admin', 'course-options'], queryFn: () => get(EP.admin.courses, { status: 'published', limit: 100 }).then((r) => r.data.courses) });
  const enroll = useApiMutation(() => post(EP.admin.enrollStudent(student.id), { course_id: Number(courseId) }), {
    invalidate: [KEY, ['admin', 'enrollments']],
    onSuccess: onDone
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (courseId) enroll.mutate();
      }}
    >
      <Field label="Course" htmlFor="enroll_course" required>
        <Select id="enroll_course" value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
          <option value="">Select a published course</option>
          {courses.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" loading={enroll.isPending} disabled={!courseId}>
        Enroll student
      </Button>
    </form>
  );
}
