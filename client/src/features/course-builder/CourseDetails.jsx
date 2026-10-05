'use client';

import { useRouter } from 'next/navigation';
import { patch, del } from '@/lib/api/client';
import { manage } from '@/lib/api/endpoints';
import { Badge, Button, Card, CardHeader, StatCard } from '@/components/ui';
import { useApiMutation } from '@/hooks/useApiMutation';
import CourseForm from './CourseForm';
import CourseTutorsCard from './CourseTutorsCard';
import { useManagedCourse } from './CourseManageShell';
import { builderKeys } from './keys';
import { humanize } from '@/lib/utils';

/** Status changes a tutor may make (mirrors the API); admins may set any status. */
const TUTOR_TRANSITIONS = {
  draft: ['pending'],
  rejected: ['pending', 'draft'],
  pending: ['draft'],
  approved: ['published', 'draft'],
  published: ['archived'],
  archived: ['pending']
};
/**
 * Admin transitions. "Approve" (approved but not live) is only offered before a
 * course is published - on a published course it would take it off the site.
 */
const ADMIN_TRANSITIONS = {
  draft: ['published', 'approved', 'rejected', 'archived'],
  pending: ['published', 'approved', 'rejected', 'draft'],
  approved: ['published', 'rejected', 'draft'],
  published: ['archived', 'draft'],
  rejected: ['published', 'approved', 'draft'],
  archived: ['published', 'draft']
};
const ACTION_LABEL = { pending: 'Submit for review', draft: 'Move to draft', published: 'Publish', archived: 'Archive', approved: 'Approve (not live yet)', rejected: 'Reject' };

export default function CourseDetails({ role, courseId }) {
  const router = useRouter();
  const { data } = useManagedCourse(role, courseId);
  const m = manage(role);
  const invalidate = [builderKeys.all(role)];
  const setStatus = useApiMutation((status) => patch(m.courseStatus(courseId), { status }), { invalidate });
  const remove = useApiMutation(() => del(m.course(courseId)), { invalidate, onSuccess: () => router.push(`/${role}/courses`) });
  if (!data) return null;

  const { course, summary } = data;
  const next = (role === 'admin' ? ADMIN_TRANSITIONS : TUTOR_TRANSITIONS)[course.status] || [];
  const changeStatus = (s) => {
    if (course.status === 'published' && !confirm('This removes the course from the website and students can no longer buy it. Continue?')) return;
    setStatus.mutate(s);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <CourseForm role={role} course={course} />
      </div>
      <div className="space-y-6">
        {role === 'admin' && <CourseTutorsCard key={course.updated_at} course={course} />}
        <Card>
          <CardHeader title="Status" action={<Badge>{humanize(course.status)}</Badge>} />
          <div className="space-y-3 p-5">
            {course.approval_note && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Reviewer note: {course.approval_note}</p>}
            <div className="flex flex-wrap gap-2">
              {next.map((s) => (
                <Button key={s} size="sm" variant={s === 'pending' || s === 'published' ? 'primary' : 'secondary'} loading={setStatus.isPending && setStatus.variables === s} onClick={() => changeStatus(s)}>
                  {ACTION_LABEL[s] || humanize(s)}
                </Button>
              ))}
            </div>
            {role === 'tutor' && course.status === 'draft' && <p className="text-xs text-slate-500">Submit the course for admin review when the curriculum is ready.</p>}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Videos" value={summary.videos} />
          <StatCard label="Resources" value={summary.resources} />
          <StatCard label="Quizzes" value={summary.quizzes} />
          <StatCard label="Live classes" value={summary.live_classes} />
        </div>
        {!summary.project && (
          <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            No final project yet. Without one, students complete the course at 90% progress automatically.
          </p>
        )}
        <Button variant="danger" size="sm" onClick={() => confirm('Delete this course? This cannot be undone.') && remove.mutate()}>
          Delete course
        </Button>
      </div>
    </div>
  );
}
