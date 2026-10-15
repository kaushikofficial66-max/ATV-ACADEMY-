'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Laptop, Monitor, Smartphone, Tablet, HelpCircle } from 'lucide-react';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Avatar, Badge, DataTable, ProgressBar, StatusBadge } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { cn, formatDate, formatDateTime, formatPrice, fullName, humanize } from '@/lib/utils';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity & devices' },
  { key: 'courses', label: 'Courses' },
  { key: 'learning', label: 'Learning' },
  { key: 'watching', label: 'Watching' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'engagement', label: 'Community & more' }
];

export const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Laptop, unknown: HelpCircle };
export const DEVICE_LABEL = { mobile: 'Mobile', tablet: 'Tablet', desktop: 'Laptop / Desktop', unknown: 'Unknown' };

/** Admin "More info" view of a student: every stored record, grouped by category. */
export default function StudentInfoModal({ studentId, onClose }) {
  const [tab, setTab] = useState('overview');
  const query = useQuery({
    queryKey: ['admin', 'students', 'detail', String(studentId)],
    queryFn: () => get(EP.admin.student(studentId)).then((r) => withDefaults(r.data)),
    enabled: Boolean(studentId)
  });

  return (
    <Modal open={Boolean(studentId)} onClose={onClose} title="Student details" size="xl">
      <QueryState query={query} loading={<Loader />}>
        {(d) => (
          <div className="space-y-4">
            <Header d={d} />
            {d.outdated && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Activity, device and watching data is not available from the API yet. Restart the API server to load the latest version.
              </p>
            )}
            <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Student detail sections">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', tab === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800')}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            {tab === 'overview' && <Overview d={d} />}
            {tab === 'activity' && <Activity d={d} />}
            {tab === 'courses' && <Courses d={d} />}
            {tab === 'learning' && <Learning d={d} />}
            {tab === 'watching' && <Watching d={d} />}
            {tab === 'purchases' && <Purchases d={d} />}
            {tab === 'engagement' && <Engagement d={d} />}
          </div>
        )}
      </QueryState>
    </Modal>
  );
}

/* ---------- building blocks ---------- */

export function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

export function Facts({ items }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="font-medium text-slate-800">{value ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tile({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

/** Horizontal share bars for { key: count } breakdowns (devices, OS, browsers). */
export function Breakdown({ data, labels = {}, icons = {}, empty = 'No data yet.' }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (!total) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {entries.map(([key, n]) => {
        const Icon = icons[key] || Monitor;
        const pct = Math.round((n / total) * 100);
        return (
          <li key={key} className="flex items-center gap-3 text-sm">
            <Icon className="size-4 shrink-0 text-slate-500" aria-hidden />
            <span className="w-36 shrink-0 text-slate-700">{labels[key] || humanize(key)}</span>
            <ProgressBar value={pct} className="flex-1" />
            <span className="w-20 shrink-0 text-right text-xs text-slate-500">
              {n} ({pct}%)
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Fills every section the modal reads, so a partial or older API response
 * (e.g. a server not restarted after an update) never crashes the view.
 */
const withDefaults = (d = {}) => {
  const student = d.student || {};
  return {
    ...d,
    outdated: !d.activity,
    student,
    stats: { enrollments: 0, completed: 0, total_spent: 0, orders: 0, certificates: 0, reviews: 0, ...d.stats },
    activity: {
      account_status: student.status,
      email_verified: Boolean(student.email_verified_at),
      joined_at: student.created_at || student.createdAt,
      last_login_at: student.last_login_at,
      last_logout_at: null,
      last_seen_at: null,
      is_online: false,
      total_logins: 0,
      active_sessions: 0,
      ...d.activity
    },
    devices: { logins_by_device: {}, logins_by_os: {}, logins_by_browser: {}, plays_by_device: {}, plays_by_os: {}, ...d.devices },
    sessions: d.sessions || [],
    watching: { total_plays: 0, last_played_at: null, videos_watched: 0, lectures_completed: 0, recent_plays: [], ...d.watching },
    learning: { quiz_attempts: [], quizzes_passed: 0, quiz_average: null, project_submissions: [], live_classes: [], progress_activities: [], ...d.learning },
    engagement: { community_posts: 0, community_comments: 0, wishlist: [], cart: [], notifications_total: 0, notifications_unread: 0, ...d.engagement },
    enrollments: d.enrollments || [],
    orders: d.orders || [],
    certificates: d.certificates || [],
    reviews: d.reviews || []
  };
};

const topKey = (obj) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
const dt = (v) => (v ? formatDateTime(v) : '-');

/* ---------- header + tabs ---------- */

function Header({ d }) {
  const s = d.student;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar user={s} size={56} />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold text-slate-900">{fullName(s)}</p>
        <p className="text-sm text-slate-500">
          {s.email}
          {s.phone ? ` · ${s.phone}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={s.status} />
        {d.activity.is_online ? <Badge tone="green">Online now</Badge> : <Badge>Offline</Badge>}
        {s.is_email_verified ? <Badge tone="green">Email verified</Badge> : <Badge tone="amber">Email unverified</Badge>}
      </div>
    </div>
  );
}

function Overview({ d }) {
  const p = d.student.profile || {};
  const device = topKey(d.devices.plays_by_device) || topKey(d.devices.logins_by_device);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Courses" value={d.stats.enrollments} />
        <Tile label="Completed" value={d.stats.completed} />
        <Tile label="Certificates" value={d.stats.certificates} />
        <Tile label="Spent" value={formatPrice(d.stats.total_spent)} />
        <Tile label="Video plays" value={d.watching.total_plays} />
        <Tile label="Logins" value={d.activity.total_logins} />
      </div>
      <Section title="Quick summary">
        <Facts
          items={[
            ['Last login', dt(d.activity.last_login_at)],
            ['Last seen', dt(d.activity.last_seen_at)],
            ['Mostly uses', device ? DEVICE_LABEL[device] : '-'],
            ['Joined', formatDate(d.activity.joined_at)],
            ['Lectures completed', d.watching.lectures_completed],
            ['Quiz average', d.learning.quiz_average !== null ? `${d.learning.quiz_average}%` : '-']
          ]}
        />
      </Section>
      <Section title="Profile">
        <Facts
          items={[
            ['First name', d.student.first_name],
            ['Last name', d.student.last_name],
            ['Phone', d.student.phone],
            ['Date of birth', p.date_of_birth ? formatDate(p.date_of_birth) : null],
            ['Gender', p.gender ? humanize(p.gender) : null],
            ['City', p.city],
            ['State', p.state],
            ['Country', p.country],
            ['Postal code', p.postal_code],
            ['Address', p.address],
            ['Website', p.website],
            ['LinkedIn', p.linkedin_url]
          ]}
        />
        {p.bio && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{p.bio}</p>}
      </Section>
    </div>
  );
}

function Activity({ d }) {
  const a = d.activity;
  return (
    <div className="space-y-5">
      <Section title="Activity status">
        <Facts
          items={[
            ['Account status', humanize(a.account_status)],
            ['Online now', a.is_online ? 'Yes' : 'No'],
            ['Last login', dt(a.last_login_at)],
            ['Last logout', dt(a.last_logout_at)],
            ['Last seen', dt(a.last_seen_at)],
            ['Total logins', a.total_logins],
            ['Active sessions', a.active_sessions],
            ['Email verified', a.email_verified ? 'Yes' : 'No'],
            ['Joined', formatDate(a.joined_at)]
          ]}
        />
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Devices used to log in">
          <Breakdown data={d.devices.logins_by_device} labels={DEVICE_LABEL} icons={DEVICE_ICON} empty="No logins recorded yet." />
        </Section>
        <Section title="Operating systems">
          <Breakdown data={d.devices.logins_by_os} empty="No logins recorded yet." />
        </Section>
        <Section title="Browsers">
          <Breakdown data={d.devices.logins_by_browser} empty="No logins recorded yet." />
        </Section>
      </div>
      <Section title="Login history (latest 50)">
        <DataTable
          rows={d.sessions}
          empty="No sessions recorded yet. Sessions are tracked from now on, at each login."
          columns={[
            {
              key: 'device_type',
              header: 'Device',
              render: (s) => {
                const Icon = DEVICE_ICON[s.device_type] || HelpCircle;
                return (
                  <span className="inline-flex items-center gap-2">
                    <Icon className="size-4 text-slate-500" aria-hidden /> {DEVICE_LABEL[s.device_type]}
                  </span>
                );
              }
            },
            { key: 'os', header: 'OS / browser', render: (s) => [s.os, s.browser].filter(Boolean).join(' · ') || '-' },
            { key: 'ip_address', header: 'IP', render: (s) => s.ip_address || '-' },
            { key: 'login_at', header: 'Login', render: (s) => dt(s.login_at) },
            { key: 'last_seen_at', header: 'Last active', render: (s) => dt(s.last_seen_at) },
            { key: 'logout_at', header: 'Logout', render: (s) => (s.logout_at ? dt(s.logout_at) : <Badge tone="green">Active</Badge>) }
          ]}
        />
      </Section>
    </div>
  );
}

function Courses({ d }) {
  return (
    <Section title={`Enrolled courses (${d.enrollments.length})`}>
      <DataTable
        rows={d.enrollments}
        empty="Not enrolled in any course."
        columns={[
          { key: 'course', header: 'Course', render: (e) => <span className="font-medium text-slate-900">{e.course?.title}</span> },
          {
            key: 'progress',
            header: 'Progress',
            render: (e) => (
              <div className="flex w-36 items-center gap-2">
                <ProgressBar value={e.completion_percentage} />
                <span className="text-xs">{Number(e.completion_percentage)}%</span>
              </div>
            )
          },
          {
            key: 'lectures',
            header: 'Lectures',
            render: (e) => (e.courseProgress ? `${e.courseProgress.completed_lectures}/${e.courseProgress.total_lectures}` : '-')
          },
          { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
          { key: 'certificate', header: 'Certificate', render: (e) => (e.certificate ? <StatusBadge status={e.certificate.status} /> : '-') },
          { key: 'enrolled_at', header: 'Enrolled', render: (e) => formatDate(e.enrolled_at) },
          { key: 'expires_at', header: 'Expires', render: (e) => (e.expires_at ? formatDate(e.expires_at) : 'Never') }
        ]}
      />
    </Section>
  );
}

function Learning({ d }) {
  const l = d.learning;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Quiz attempts" value={l.quiz_attempts.length} />
        <Tile label="Quizzes passed" value={l.quizzes_passed} />
        <Tile label="Projects submitted" value={l.project_submissions.length} />
        <Tile label="Live classes" value={l.live_classes.length} />
      </div>
      <Section title="Quiz attempts">
        <DataTable
          rows={l.quiz_attempts}
          empty="No quiz attempts."
          columns={[
            { key: 'quiz', header: 'Quiz', render: (a) => a.quiz?.title },
            { key: 'attempt_number', header: '#' },
            { key: 'percentage', header: 'Score', render: (a) => (a.status === 'started' ? 'In progress' : `${a.percentage}%`) },
            { key: 'passed', header: 'Result', render: (a) => (a.status === 'started' ? '-' : a.passed ? <Badge tone="green">Passed</Badge> : <Badge tone="red">Failed</Badge>) },
            { key: 'submitted_at', header: 'Date', render: (a) => dt(a.submitted_at || a.started_at) }
          ]}
        />
      </Section>
      <Section title="Final project submissions">
        <DataTable
          rows={l.project_submissions}
          empty="No project submissions."
          columns={[
            { key: 'course', header: 'Course', render: (s) => s.project?.course?.title },
            { key: 'project', header: 'Project', render: (s) => s.project?.title },
            { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
            { key: 'tutor_feedback', header: 'Feedback', render: (s) => s.tutor_feedback || '-' },
            { key: 'submitted_at', header: 'Submitted', render: (s) => dt(s.submitted_at) }
          ]}
        />
      </Section>
      <Section title="Live class attendance">
        <DataTable
          rows={l.live_classes}
          empty="No live classes attended."
          columns={[
            { key: 'class', header: 'Class', render: (p) => p.liveClass?.title },
            { key: 'course', header: 'Course', render: (p) => p.liveClass?.course?.title },
            { key: 'attendance_status', header: 'Attendance', render: (p) => <StatusBadge status={p.attendance_status} /> },
            { key: 'joined_at', header: 'Joined', render: (p) => dt(p.joined_at) },
            { key: 'left_at', header: 'Left', render: (p) => dt(p.left_at) }
          ]}
        />
      </Section>
      <Section title="Recent progress (90% rule)">
        <DataTable
          rows={l.progress_activities}
          empty="No progress activity yet."
          columns={[
            { key: 'course', header: 'Course', render: (p) => p.course?.title },
            { key: 'activity_type', header: 'Activity', render: (p) => humanize(p.activity_type) },
            { key: 'increment_percent', header: 'Added', render: (p) => `+${Number(p.increment_percent)}%` },
            { key: 'progress_after', header: 'Progress after', render: (p) => `${Number(p.progress_after)}%` },
            { key: 'created_at', header: 'When', render: (p) => dt(p.created_at) }
          ]}
        />
      </Section>
    </div>
  );
}

function Watching({ d }) {
  const w = d.watching;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Video plays" value={w.total_plays} />
        <Tile label="Videos watched" value={w.videos_watched} />
        <Tile label="Lectures completed" value={w.lectures_completed} />
        <Tile label="Last watched" value={w.last_played_at ? formatDate(w.last_played_at) : '-'} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Watching on">
          <Breakdown data={d.devices.plays_by_device} labels={DEVICE_LABEL} icons={DEVICE_ICON} empty="No video plays recorded yet." />
        </Section>
        <Section title="Operating systems while watching">
          <Breakdown data={d.devices.plays_by_os} empty="No video plays recorded yet." />
        </Section>
      </div>
      <Section title="Recent plays">
        <DataTable
          rows={w.recent_plays}
          empty="No video plays recorded yet."
          columns={[
            { key: 'video', header: 'Video', render: (p) => p.video?.title || `#${p.video_id}` },
            { key: 'course', header: 'Course', render: (p) => p.course?.title },
            { key: 'device_type', header: 'Device', render: (p) => DEVICE_LABEL[p.device_type] },
            { key: 'os', header: 'OS / browser', render: (p) => [p.os, p.browser].filter(Boolean).join(' · ') || '-' },
            { key: 'played_at', header: 'Played', render: (p) => dt(p.played_at) }
          ]}
        />
      </Section>
    </div>
  );
}

function Purchases({ d }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Orders" value={d.stats.orders} />
        <Tile label="Total spent" value={formatPrice(d.stats.total_spent)} />
        <Tile label="Certificates" value={d.stats.certificates} />
      </div>
      <Section title="Orders">
        <DataTable
          rows={d.orders}
          empty="No orders."
          columns={[
            { key: 'order_number', header: 'Order', render: (o) => <span className="font-mono text-xs">{o.order_number}</span> },
            { key: 'items', header: 'Courses', render: (o) => o.items?.map((i) => i.course_title).join(', ') },
            { key: 'total_amount', header: 'Total', render: (o) => formatPrice(o.total_amount) },
            { key: 'method', header: 'Method', render: (o) => humanize(o.payments?.find((p) => p.status === 'success')?.payment_method) || '-' },
            { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
            { key: 'created_at', header: 'Date', render: (o) => dt(o.created_at || o.createdAt) }
          ]}
        />
      </Section>
      <Section title="Certificates">
        <DataTable
          rows={d.certificates}
          empty="No certificates."
          columns={[
            { key: 'course', header: 'Course', render: (c) => c.course?.title },
            { key: 'certificate_number', header: 'Number', render: (c) => <span className="font-mono text-xs">{c.certificate_number || '-'}</span> },
            { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
            { key: 'issued_at', header: 'Issued', render: (c) => (c.issued_at ? formatDate(c.issued_at) : '-') }
          ]}
        />
      </Section>
    </div>
  );
}

function Engagement({ d }) {
  const e = d.engagement;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Posts" value={e.community_posts} />
        <Tile label="Comments" value={e.community_comments} />
        <Tile label="Reviews" value={d.reviews.length} />
        <Tile label="Wishlist" value={e.wishlist.length} />
        <Tile label="In cart" value={e.cart.length} />
        <Tile label="Unread alerts" value={`${e.notifications_unread}/${e.notifications_total}`} />
      </div>
      <Section title="Reviews">
        <DataTable
          rows={d.reviews}
          empty="No reviews."
          columns={[
            { key: 'course', header: 'Course', render: (r) => r.course?.title },
            { key: 'rating', header: 'Rating', render: (r) => `${r.rating} ★` },
            { key: 'review', header: 'Review', render: (r) => <span className="line-clamp-2 max-w-md">{r.review || '-'}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }
          ]}
        />
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Wishlist">
          {e.wishlist.length ? (
            <ul className="list-inside list-disc text-sm text-slate-700">
              {e.wishlist.map((c) => (
                <li key={c.id}>{c.title}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Empty.</p>
          )}
        </Section>
        <Section title="Cart">
          {e.cart.length ? (
            <ul className="list-inside list-disc text-sm text-slate-700">
              {e.cart.map((i) => (
                <li key={i.course?.id}>
                  {i.course?.title} - {formatPrice(i.price)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Empty.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
