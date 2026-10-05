'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { get, downloadFile } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, DataTable, PageHeader, StatusBadge } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { formatDateTime } from '@/lib/utils';

const LABEL = { submitted: 'Pending approval', under_review: 'Pending approval', resubmission_required: 'Changes requested' };

export default function MyProjectsPage() {
  const query = useQuery({ queryKey: ['student', 'submissions'], queryFn: () => get(EP.student.submissions).then((r) => r.data.submissions) });
  return (
    <>
      <PageHeader title="Final projects" description="Submitting the final project takes a course from 90% to 100% once it is approved." />
      <Card>
        <QueryState query={query} loading={<Loader />}>
          {(rows) => (
            <DataTable
              rows={rows}
              empty="You have not submitted any projects yet. The final project unlocks at 90% course progress."
              columns={[
                {
                  key: 'course',
                  header: 'Course',
                  render: (s) => (
                    <Link href={`/student/learn/${s.project?.course?.id}`} className="font-medium text-slate-900 hover:text-brand-800">
                      {s.project?.course?.title}
                    </Link>
                  )
                },
                { key: 'project', header: 'Project', render: (s) => s.project?.title },
                { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} label={LABEL[s.status]} /> },
                { key: 'tutor_feedback', header: 'Feedback', render: (s) => s.tutor_feedback || '-' },
                { key: 'submitted_at', header: 'Submitted', render: (s) => formatDateTime(s.submitted_at) },
                {
                  key: 'download',
                  header: '',
                  render: (s) => (
                    <Button size="sm" variant="ghost" onClick={() => downloadFile(EP.student.submissionDownload(s.id), s.file_name)}>
                      Download
                    </Button>
                  )
                }
              ]}
            />
          )}
        </QueryState>
      </Card>
    </>
  );
}
