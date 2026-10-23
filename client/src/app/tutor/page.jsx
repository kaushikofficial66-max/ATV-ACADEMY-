'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, GraduationCap, Star, ClipboardCheck, Award } from 'lucide-react';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, CardHeader, PageHeader, StatCard } from '@/components/ui';
import { QueryState, EmptyState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import PendingApprovalsList from '@/features/projects/PendingApprovalsList';
import { formatDateTime, formatNumber } from '@/lib/utils';

export default function TutorDashboardPage() {
  const query = useQuery({ queryKey: ['tutor', 'dashboard'], queryFn: () => get(EP.tutor.dashboard).then((r) => r.data) });

  return (
    <>
      <PageHeader title="Dashboard" description="Your courses and students" actions={<Button href="/tutor/courses/new">Create course</Button>} />
      <QueryState query={query} loading={<Loader />}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Courses" value={d.overview.total_courses} icon={BookOpen} hint={`${d.overview.published_courses} published`} href="/tutor/courses" />
              <StatCard label="Students" value={formatNumber(d.overview.total_students)} icon={GraduationCap} hint={`${d.overview.completed_enrollments} completed`} href="/tutor/students" />
              <StatCard label="Rating" value={d.overview.average_rating || '-'} icon={Star} hint={`${d.overview.total_reviews} reviews`} href="/tutor/reviews" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Projects to review" value={d.overview.pending_project_reviews} icon={ClipboardCheck} href="/tutor/submissions" />
              <StatCard label="Certificates pending" value={d.overview.pending_certificate_approvals} icon={Award} href="/tutor/certificates" />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader title="Project approvals" description="Students at 90% waiting for your review" action={<Link href="/tutor/submissions" className="text-sm text-brand-700 hover:underline">View all</Link>} />
                <PendingApprovalsList items={d.pending_project_approvals} role="tutor" />
              </Card>
              <Card>
                <CardHeader title="Upcoming live classes" action={<Link href="/tutor/live-classes" className="text-sm text-brand-700 hover:underline">Schedule</Link>} />
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
