'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, UserCheck, BookOpen, IndianRupee, ClipboardCheck, Award, Star, Video } from 'lucide-react';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Card, CardHeader, DataTable, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import PendingApprovalsList from '@/features/projects/PendingApprovalsList';
import { formatDate, formatNumber, formatPrice, fullName } from '@/lib/utils';

export default function AdminDashboardPage() {
  const query = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => get(EP.admin.dashboard).then((r) => r.data) });

  return (
    <>
      <PageHeader title="Dashboard" description="Platform overview" />
      <QueryState query={query} loading={<Loader />}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Students" value={formatNumber(d.overview.total_students)} icon={GraduationCap} hint={`${d.student_summary.new_last_30_days} new in 30 days`} href="/admin/students" />
              <StatCard label="Tutors" value={formatNumber(d.overview.total_tutors)} icon={UserCheck} hint={`${d.overview.pending_tutor_approvals} awaiting approval`} href="/admin/tutors?status=pending" />
              <StatCard label="Courses" value={formatNumber(d.overview.total_courses)} icon={BookOpen} hint={`${d.overview.pending_course_approvals} awaiting approval`} href="/admin/courses?status=pending" />
              <StatCard label="Revenue" value={formatPrice(d.overview.total_revenue)} icon={IndianRupee} hint={`${formatPrice(d.sales_summary.revenue_this_month)} this month`} href="/admin/orders" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Projects pending approval" value={d.overview.pending_project_approvals} icon={ClipboardCheck} href="/admin/submissions" />
              <StatCard label="Certificates pending" value={d.overview.pending_certificates} icon={Award} href="/admin/certificates?status=pending" />
              <StatCard label="Reviews to moderate" value={d.overview.pending_review_moderation} icon={Star} href="/admin/reviews?status=pending" />
              <StatCard label="Upcoming live classes" value={d.overview.upcoming_live_classes} icon={Video} href="/admin/live-classes" />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader title="Project approvals" description="Final projects waiting for review (oldest first)" action={<Link href="/admin/submissions" className="text-sm text-brand-700 hover:underline">View all</Link>} />
                <PendingApprovalsList items={d.pending_project_approvals} role="admin" />
              </Card>
              <Card>
                <CardHeader title="Recent orders" action={<Link href="/admin/orders" className="text-sm text-brand-700 hover:underline">View all</Link>} />
                <DataTable
                  rows={d.sales_summary.recent_orders}
                  empty="No orders yet."
                  columns={[
                    { key: 'order_number', header: 'Order' },
                    { key: 'user', header: 'Customer', render: (o) => fullName(o.user) },
                    { key: 'total_amount', header: 'Total', render: (o) => formatPrice(o.total_amount) },
                    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
                    { key: 'created_at', header: 'Date', render: (o) => formatDate(o.created_at) }
                  ]}
                />
              </Card>
            </div>

            <Card>
              <CardHeader title="Top selling courses" />
              <DataTable
                rows={d.course_summary.top_selling}
                rowKey="course_id"
                empty="No sales yet."
                columns={[
                  { key: 'course_title', header: 'Course' },
                  { key: 'sales', header: 'Sales' },
                  { key: 'revenue', header: 'Revenue', render: (c) => formatPrice(c.revenue) }
                ]}
              />
            </Card>
          </div>
        )}
      </QueryState>
    </>
  );
}
