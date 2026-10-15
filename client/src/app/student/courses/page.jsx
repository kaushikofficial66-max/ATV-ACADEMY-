'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { GraduationCap, Lock } from 'lucide-react';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Card, PageHeader, Pagination } from '@/components/ui';
import { QueryState, EmptyState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { learningKeys } from '@/features/learning/keys';
import CourseTile from '@/features/learning/CourseTile';
import LockedCourseTile from '@/features/learning/LockedCourseTile';
import { cn, fullName } from '@/lib/utils';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'not_started', label: 'Not started' },
  { value: 'completed', label: 'Completed' }
];

export default function MyCoursesPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const params = { status: status || undefined, page, limit: 12 };
  const query = useQuery({
    queryKey: learningKeys.myCourses(params),
    queryFn: () => get(EP.student.courses, params),
    placeholderData: keepPreviousData
  });

  // Courses of the other store plans: visible but locked (only for students who bought a plan).
  const locked = useQuery({ queryKey: learningKeys.locked, queryFn: () => get(EP.student.lockedCourses).then((r) => r.data) });
  const lockedCourses = locked.data?.is_plan_buyer ? locked.data.courses : [];

  return (
    <>
      <PageHeader title="My courses" description="Everything you have enrolled in" />

      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Filter courses">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={status === f.value}
            onClick={() => {
              setStatus(f.value);
              setPage(1);
            }}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition',
              status === f.value ? 'bg-brand-700 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <QueryState query={query} loading={<Loader />}>
        {({ data, meta }) =>
          data.enrollments.length === 0 ? (
            <Card>
              <EmptyState
                icon={GraduationCap}
                title={status ? 'No courses in this view' : 'No courses yet'}
                description={status ? 'Try another filter.' : 'Courses you purchase appear here automatically. If you just paid, it can take a minute - or write to support@antarikshtv.com.'}
              />
            </Card>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {data.enrollments.map((e) => (
                  <CourseTile
                    key={e.id}
                    id={e.course.id}
                    title={e.course.title}
                    thumbnail={e.course.thumbnail_url}
                    tutors={e.course.tutors?.map(fullName).join(', ')}
                    pct={e.progress?.completion_percentage ?? 0}
                    status={e.progress?.status}
                    statusLabel={e.progress?.status_label}
                  />
                ))}
              </div>
              <Card className="mt-6">
                <Pagination meta={meta} onPageChange={setPage} />
              </Card>
            </>
          )
        }
      </QueryState>

      {lockedCourses.length > 0 && (
        <section className="mt-10" aria-labelledby="locked-heading">
          <div className="mb-4 flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Lock className="size-4" aria-hidden />
            </span>
            <div>
              <h2 id="locked-heading" className="text-lg font-semibold text-slate-900">
                More courses you can unlock
              </h2>
              <p className="text-sm text-slate-500">These are part of other plans. Buy a course on its own, or upgrade your plan, to open it.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
            {lockedCourses.map((c) => (
              <LockedCourseTile key={c.id} course={c} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
