'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Award, BookOpen, CalendarClock, CircleCheck, GraduationCap, PlayCircle, TrendingUp } from 'lucide-react';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Card, CardHeader, ProgressBar, ProgressRing, StatCard } from '@/components/ui';
import { QueryState, EmptyState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useAuth } from '@/features/auth/AuthProvider';
import CourseTile from '@/features/learning/CourseTile';
import { formatDateTime } from '@/lib/utils';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['student', 'dashboard'], queryFn: () => get(EP.student.dashboard).then((r) => r.data) });

  return (
    <QueryState query={query} loading={<Loader />}>
      {(d) => {
        // Continue where the learner left off: the first course that is not finished yet.
        const resume = d.recent_courses.find((c) => Number(c.completion_percentage) < 100) || d.recent_courses[0];
        return (
          <div className="space-y-6 sm:space-y-8">
            {/* Welcome + resume */}
            <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-500 p-5 text-white shadow-lg shadow-brand-900/10 sm:rounded-3xl sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/10" aria-hidden />
              <div className="pointer-events-none absolute -bottom-24 right-24 size-72 rounded-full bg-white/5" aria-hidden />
              <div className="relative grid items-center gap-6 lg:grid-cols-[1.3fr_1fr]">
                <div>
                  <p className="text-sm font-medium text-brand-100">{greeting()}</p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-4xl">{user?.first_name ? `${user.first_name}, welcome back` : 'Welcome back'}</h1>
                  <p className="mt-2 max-w-md text-brand-100">
                    {resume ? 'Pick up right where you left off.' : 'Your courses will show up here as soon as your purchase is confirmed.'}
                  </p>
                </div>
                {resume && (
                  <div className="rounded-2xl bg-white p-5 text-slate-900 shadow-xl shadow-black/10">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Continue learning</p>
                    <div className="mt-3 flex items-center gap-4">
                      <ProgressRing value={resume.completion_percentage} size={64} stroke={6} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 font-semibold leading-snug">{resume.course.title}</p>
                        <ProgressBar value={resume.completion_percentage} className="mt-2" />
                      </div>
                    </div>
                    <Link
                      href={`/student/learn/${resume.course.id}`}
                      className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 text-sm font-medium text-white transition hover:bg-brand-800"
                    >
                      <PlayCircle className="size-4" aria-hidden /> {Number(resume.completion_percentage) > 0 ? 'Continue' : 'Start course'}
                    </Link>
                  </div>
                )}
              </div>
            </section>

            {/* Numbers */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              <StatCard label="Enrolled courses" value={d.overview.enrolled_courses} icon={BookOpen} href="/student/courses" />
              <StatCard label="Average progress" value={`${d.overview.average_progress}%`} icon={TrendingUp} />
              <StatCard label="Completed" value={d.overview.completed_courses} icon={CircleCheck} />
              <StatCard label="Certificates" value={d.overview.certificates_issued} icon={Award} href="/student/certificates" />
            </div>

            <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
              {/* Courses */}
              <section>
                <div className="mb-4 flex items-end justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">My courses</h2>
                  <Link href="/student/courses" className="text-sm font-medium text-brand-700 hover:underline">
                    View all
                  </Link>
                </div>
                {d.recent_courses.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon={GraduationCap}
                      title="No courses yet"
                      description="Courses you purchase appear here automatically. If you just paid, it can take a minute - or write to support@antarikshtv.com."
                    />
                  </Card>
                ) : (
                  <div className="grid gap-6 sm:grid-cols-2">
                    {d.recent_courses.slice(0, 4).map((c) => (
                      <CourseTile
                        key={c.enrollment_id}
                        id={c.course.id}
                        title={c.course.title}
                        thumbnail={c.course.thumbnail_url}
                        pct={c.completion_percentage}
                        status={c.progress?.status}
                        statusLabel={c.progress?.status_label}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Live classes */}
              <aside>
                <Card>
                  <CardHeader title="Upcoming live classes" />
                  {d.upcoming_live_classes.length === 0 ? (
                    <EmptyState icon={CalendarClock} title="No upcoming classes" description="Scheduled classes will be listed here." />
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {d.upcoming_live_classes.map((c) => (
                        <li key={c.id} className="flex gap-3 px-5 py-4">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                            <CalendarClock className="size-5" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{c.title}</p>
                            <p className="truncate text-xs text-slate-500">{c.course?.title}</p>
                            <p className="mt-0.5 text-xs font-medium text-brand-700">{formatDateTime(c.scheduled_start)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </aside>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
