'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CircleCheck, Award, TrendingUp } from 'lucide-react';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, CardHeader, PageHeader, ProgressBar, StatCard, StatusBadge } from '@/components/ui';
import { QueryState, EmptyState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDateTime } from '@/lib/utils';

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['student', 'dashboard'], queryFn: () => get(EP.student.dashboard).then((r) => r.data) });

  return (
    <>
      <PageHeader title={`Welcome back, ${user?.first_name || ''}`} description="Pick up where you left off" actions={<Button href="/courses" variant="secondary">Browse courses</Button>} />
      <QueryState query={query} loading={<Loader />}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Enrolled courses" value={d.overview.enrolled_courses} icon={BookOpen} href="/student/courses" />
              <StatCard label="Average progress" value={`${d.overview.average_progress}%`} icon={TrendingUp} />
              <StatCard label="Completed" value={d.overview.completed_courses} icon={CircleCheck} />
              <StatCard label="Certificates" value={d.overview.certificates_issued} icon={Award} href="/student/certificates" />
            </div>
            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader title="Recent courses" action={<Link href="/student/courses" className="text-sm text-brand-700 hover:underline">All courses</Link>} />
                {d.recent_courses.length === 0 ? (
                  <EmptyState title="You are not enrolled in any course yet" action={<Button href="/courses">Find a course</Button>} />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {d.recent_courses.map((c) => (
                      <li key={c.enrollment_id} className="flex items-center gap-4 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <Link href={`/student/learn/${c.course.id}`} className="font-medium text-slate-900 hover:text-brand-800">
                            {c.course.title}
                          </Link>
                          <div className="mt-2 flex items-center gap-3">
                            <ProgressBar value={c.completion_percentage} className="max-w-xs" />
                            <span className="text-xs text-slate-500">{c.completion_percentage}%</span>
                          </div>
                        </div>
                        {c.progress && <StatusBadge status={c.progress.status} label={c.progress.status_label} />}
                        <Button href={`/student/learn/${c.course.id}`} size="sm" variant="secondary">
                          Continue
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card>
                <CardHeader title="Upcoming live classes" />
                {d.upcoming_live_classes.length === 0 ? (
                  <EmptyState title="No upcoming classes" />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {d.upcoming_live_classes.map((c) => (
                      <li key={c.id} className="px-5 py-3">
                        <p className="text-sm font-medium text-slate-900">{c.title}</p>
                        <p className="text-xs text-slate-500">
                          {c.course?.title} · {formatDateTime(c.scheduled_start)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}
