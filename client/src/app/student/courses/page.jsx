'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, PageHeader, Pagination, ProgressBar, Select, StatusBadge } from '@/components/ui';
import { QueryState, EmptyState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { learningKeys } from '@/features/learning/keys';
import { assetUrl, fullName } from '@/lib/utils';

const FILTERS = [
  { value: '', label: 'All courses' },
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

  return (
    <>
      <PageHeader
        title="My courses"
        actions={
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter courses"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        }
      />
      <QueryState query={query} loading={<Loader />}>
        {({ data, meta }) =>
          data.enrollments.length === 0 ? (
            <Card>
              <EmptyState title="No courses here yet" action={<Button href="/courses">Browse courses</Button>} />
            </Card>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {data.enrollments.map((e) => (
                  <Card key={e.id} className="flex flex-col overflow-hidden">
                    <Link href={`/student/learn/${e.course.id}`} className="block aspect-video bg-slate-100">
                      {e.course.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={assetUrl(e.course.thumbnail_url)} alt="" className="size-full object-cover" />
                      )}
                    </Link>
                    <div className="flex flex-1 flex-col p-4">
                      <Link href={`/student/learn/${e.course.id}`} className="font-semibold text-slate-900 hover:text-brand-800">
                        {e.course.title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">{e.course.tutors?.map(fullName).join(', ')}</p>
                      <div className="mt-auto pt-4">
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <StatusBadge status={e.progress?.status} label={e.progress?.status_label} />
                          <span className="text-slate-500">{e.progress?.completion_percentage ?? 0}%</span>
                        </div>
                        <ProgressBar value={e.progress?.completion_percentage} />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              <Card className="mt-5">
                <Pagination meta={meta} onPageChange={setPage} />
              </Card>
            </>
          )
        }
      </QueryState>
    </>
  );
}
