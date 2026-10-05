'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { get, put, downloadFile } from '@/lib/api/client';
import { manage } from '@/lib/api/endpoints';
import { Avatar, Button, Field, PageHeader, StatusBadge, Textarea } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import ResourceList from '@/components/data/ResourceList';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { builderKeys } from '@/features/course-builder/keys';
import { formatDateTime, fullName } from '@/lib/utils';

const STATUSES = ['submitted', 'under_review', 'approved', 'rejected', 'resubmission_required'];
const LABEL = { submitted: 'Pending approval', under_review: 'Under review' };

/**
 * Final project review (90% rule, phase 3). Approve -> course 100% +
 * certificate; reject / request changes -> student notified, stays at 90%.
 */
export default function SubmissionsReview({ role }) {
  const params = useSearchParams();
  const [reviewId, setReviewId] = useState(params.get('review'));

  return (
    <>
      <PageHeader title="Project submissions" description="Approving a final project completes the course (100%) and issues the certificate." />
      <ResourceList
        queryKey={builderKeys.submissions(role)}
        endpoint={manage(role).submissions}
        dataKey="submissions"
        searchPlaceholder="Search students..."
        initialFilters={{ status: 'submitted' }}
        filters={[{ name: 'status', label: 'Status', options: STATUSES }]}
        empty="No submissions match these filters."
        onRowClick={(s) => setReviewId(s.id)}
        columns={[
          {
            key: 'student',
            header: 'Student',
            render: (s) => (
              <div className="flex items-center gap-2">
                <Avatar user={s.student} size={28} />
                <div>
                  <p className="font-medium text-slate-900">{fullName(s.student)}</p>
                  <p className="text-xs text-slate-500">{s.student?.email}</p>
                </div>
              </div>
            )
          },
          { key: 'course', header: 'Course', render: (s) => s.project?.course?.title },
          { key: 'progress', header: 'Progress', render: (s) => `${Number(s.enrollment?.completion_percentage ?? 0)}%` },
          { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} label={LABEL[s.status]} /> },
          { key: 'submitted_at', header: 'Submitted', render: (s) => formatDateTime(s.submitted_at) }
        ]}
      />
      <Modal open={Boolean(reviewId)} onClose={() => setReviewId(null)} title="Review submission" size="lg">
        {reviewId && <ReviewPanel role={role} id={reviewId} onDone={() => setReviewId(null)} />}
      </Modal>
    </>
  );
}

function ReviewPanel({ role, id, onDone }) {
  const m = manage(role);
  const [feedback, setFeedback] = useState('');
  const query = useQuery({ queryKey: [...builderKeys.submissions(role), 'detail', String(id)], queryFn: () => get(m.submission(id)).then((r) => r.data) });
  const review = useApiMutation((status) => put(m.submissionReview(id), { status, tutor_feedback: feedback || undefined }), {
    invalidate: [builderKeys.submissions(role), [role, 'dashboard'], builderKeys.certificates(role)],
    onSuccess: onDone
  });

  if (query.isPending) return <Loader />;
  if (!query.data) return null;
  const { submission: s, history = [] } = query.data;
  const open = ['submitted', 'under_review'].includes(s.status);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-3">
        <Avatar user={s.student} size={40} />
        <div className="flex-1">
          <p className="font-medium text-slate-900">{fullName(s.student)}</p>
          <p className="text-slate-500">
            {s.project?.course?.title} · {s.project?.title}
          </p>
        </div>
        <StatusBadge status={s.status} label={LABEL[s.status]} />
      </div>
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="text-slate-500">Submitted {formatDateTime(s.submitted_at)}</p>
        {s.submission_note && <p className="mt-2 whitespace-pre-line text-slate-700">{s.submission_note}</p>}
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => downloadFile(m.submissionDownload(s.id), s.file_name)}>
          <Download className="size-4" aria-hidden /> {s.file_name || 'Download file'}
        </Button>
      </div>
      {s.tutor_feedback && <p className="text-slate-600">Previous feedback: {s.tutor_feedback}</p>}
      {history.length > 1 && <p className="text-xs text-slate-500">{history.length} submissions in total for this project.</p>}

      {open ? (
        <>
          <Field label="Feedback for the student" htmlFor="tutor_feedback" hint="Required when rejecting or requesting changes">
            <Textarea id="tutor_feedback" rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button loading={review.isPending && review.variables === 'approved'} onClick={() => review.mutate('approved')}>
              Approve (complete course)
            </Button>
            <Button variant="secondary" disabled={!feedback.trim()} loading={review.isPending && review.variables === 'resubmission_required'} onClick={() => review.mutate('resubmission_required')}>
              Request changes
            </Button>
            <Button variant="danger" disabled={!feedback.trim()} loading={review.isPending && review.variables === 'rejected'} onClick={() => review.mutate('rejected')}>
              Reject
            </Button>
            {s.status === 'submitted' && (
              <Button variant="ghost" onClick={() => review.mutate('under_review')}>
                Mark under review
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="text-slate-500">This submission has already been reviewed.</p>
      )}
    </div>
  );
}
