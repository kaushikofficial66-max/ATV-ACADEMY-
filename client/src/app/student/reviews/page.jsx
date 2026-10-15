'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { get, del } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, DataTable, Field, PageHeader, Select, StatusBadge } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import ReviewForm from '@/features/reviews/ReviewForm';
import { formatDate } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

export default function StudentReviewsPage() {
  const ask = useConfirm();
  const [editing, setEditing] = useState(null); // { courseId, review? }
  const reviews = useQuery({ queryKey: ['student', 'reviews'], queryFn: () => get(EP.student.reviews).then((r) => r.data.reviews) });
  const courses = useQuery({
    queryKey: ['student', 'learning', 'courses', 'review-options'],
    queryFn: () => get(EP.student.courses, { limit: 100 }).then((r) => r.data.enrollments.map((e) => e.course))
  });
  const remove = useApiMutation((courseId) => del(EP.student.courseReview(courseId)), { invalidate: [['student', 'reviews']] });

  return (
    <>
      <PageHeader title="My reviews" actions={<Button onClick={() => setEditing({ courseId: '' })}>Write a review</Button>} />
      <Card>
        <QueryState query={reviews} loading={<Loader />}>
          {(rows) => (
            <DataTable
              rows={rows}
              empty="You have not reviewed any course yet."
              columns={[
                { key: 'course', header: 'Course', render: (r) => r.course?.title },
                {
                  key: 'rating',
                  header: 'Rating',
                  render: (r) => (
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden /> {r.rating}
                    </span>
                  )
                },
                { key: 'review', header: 'Review', render: (r) => <span className="line-clamp-2 max-w-md">{r.review || '-'}</span> },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'updated_at', header: 'Updated', render: (r) => formatDate(r.updated_at) },
                {
                  key: 'actions',
                  header: '',
                  render: (r) => (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditing({ courseId: r.course_id, review: r })}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => (await ask({ title: 'Delete your review?', message: 'Your review will be deleted.', confirmLabel: 'Delete' })) && remove.mutate(r.course_id)}>
                        Delete
                      </Button>
                    </div>
                  )
                }
              ]}
            />
          )}
        </QueryState>
      </Card>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.review ? 'Edit review' : 'Write a review'}>
        {editing && (
          <div className="space-y-4">
            {!editing.review && (
              <Field label="Course" htmlFor="review_course" required>
                <Select id="review_course" value={editing.courseId} onChange={(e) => setEditing({ courseId: e.target.value })}>
                  <option value="">Select a course</option>
                  {courses.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <ReviewForm key={editing.courseId} courseId={editing.courseId} initial={editing.review} onDone={() => setEditing(null)} />
          </div>
        )}
      </Modal>
    </>
  );
}
