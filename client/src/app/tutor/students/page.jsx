'use client';

import { EP } from '@/lib/api/endpoints';
import { Avatar, PageHeader, ProgressBar, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { formatDate, fullName } from '@/lib/utils';

export default function TutorStudentsPage() {
  return (
    <>
      <PageHeader title="Students" description="Learners enrolled in your courses" />
      <ResourceList
        queryKey={['tutor', 'students']}
        endpoint={EP.tutor.students}
        dataKey="students"
        searchPlaceholder="Search students..."
        filters={[{ name: 'status', label: 'Status', options: ['active', 'completed', 'expired'] }]}
        empty="No students yet."
        columns={[
          {
            key: 'student',
            header: 'Student',
            render: (e) => (
              <div className="flex items-center gap-2">
                <Avatar user={e.student} size={28} />
                <div>
                  <p className="font-medium text-slate-900">{fullName(e.student)}</p>
                  <p className="text-xs text-slate-500">{e.student?.email}</p>
                </div>
              </div>
            )
          },
          { key: 'course', header: 'Course', render: (e) => e.course?.title },
          {
            key: 'progress',
            header: 'Progress',
            render: (e) => (
              <div className="flex w-36 items-center gap-2">
                <ProgressBar value={e.completion_percentage} />
                <span className="text-xs text-slate-500">{Number(e.completion_percentage)}%</span>
              </div>
            )
          },
          { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
          { key: 'enrolled_at', header: 'Enrolled', render: (e) => formatDate(e.enrolled_at) }
        ]}
      />
    </>
  );
}
