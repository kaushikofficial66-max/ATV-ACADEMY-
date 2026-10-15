'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HelpCircle } from 'lucide-react';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Avatar, Badge, DataTable, StatusBadge } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { Breakdown, DEVICE_ICON, DEVICE_LABEL, Facts, Section, Tile } from '@/features/admin/StudentInfoModal';
import { cn, formatDate, formatDateTime, formatPrice, fullName, humanize } from '@/lib/utils';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'classes', label: 'Live classes' },
  { key: 'teaching', label: 'Teaching' },
  { key: 'activity', label: 'Activity & devices' },
  { key: 'courses', label: 'Courses' },
  { key: 'earnings', label: 'Earnings' }
];

const dt = (v) => (v ? formatDateTime(v) : '-');
const pct = (v) => (v === null || v === undefined ? '-' : `${v}%`);

/** Admin "More info" view of a tutor: sign-in activity, classes taken, teaching work, courses and earnings. */
export default function TutorInfoModal({ tutorId, onClose }) {
  const [tab, setTab] = useState('overview');
  const query = useQuery({
    queryKey: ['admin', 'tutors', 'detail', String(tutorId)],
    queryFn: () => get(EP.admin.tutor(tutorId)).then((r) => withDefaults(r.data)),
    enabled: Boolean(tutorId)
  });

  return (
    <Modal open={Boolean(tutorId)} onClose={onClose} title="Tutor details" size="xl">
      <QueryState query={query} loading={<Loader />}>
        {(d) => (
          <div className="space-y-4">
            <Header d={d} />
            {d.outdated && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Activity data is not available from the API yet. Restart the API server to load the latest version.</p>}
            <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Tutor detail sections">
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
            {tab === 'classes' && <Classes d={d} />}
            {tab === 'teaching' && <Teaching d={d} />}
            {tab === 'activity' && <Activity d={d} />}
            {tab === 'courses' && <Courses d={d} />}
            {tab === 'earnings' && <Earnings d={d} />}
          </div>
        )}
      </QueryState>
    </Modal>
  );
}

/** Fills every section so an older API response never crashes the view. */
const withDefaults = (d = {}) => ({
  ...d,
  outdated: !d.activity,
  tutor: d.tutor || {},
  stats: { courses: 0, published_courses: 0, students: 0, upcoming_live_classes: 0, ...d.stats },
  courses: d.courses || [],
  earnings: d.earnings || {},
  recent_payouts: d.recent_payouts || [],
  activity: {
    is_online: false,
    total_logins: 0,
    active_sessions: 0,
    logins_by_device: {},
    logins_by_os: {},
    logins_by_browser: {},
    sessions: [],
    ...d.activity,
    classes: { total: 0, completed: 0, cancelled: 0, upcoming: 0, recorded: 0, hours_taught: 0, by_month: [], recent: [], ...d.activity?.classes },
    teaching: {
      students_enrolled: 0,
      students_completed: 0,
      completion_rate: null,
      certificates_issued: 0,
      projects_reviewed: 0,
      projects_approved: 0,
      projects_rejected: 0,
      videos_uploaded: 0,
      reviews_received: 0,
      average_rating: null,
      community_posts: 0,
      community_comments: 0,
      ...d.activity?.teaching
    }
  }
});

function Header({ d }) {
  const t = d.tutor;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar user={t} size={56} />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold text-slate-900">{fullName(t)}</p>
        <p className="text-sm text-slate-500">
          {t.email}
          {t.phone ? ` · ${t.phone}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={t.status} />
        {d.activity.is_online ? <Badge tone="green">Online now</Badge> : <Badge>Offline</Badge>}
      </div>
    </div>
  );
}

function Overview({ d }) {
  const a = d.activity;
  const p = d.tutor.profile || {};
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Classes taken" value={a.classes.completed} />
        <Tile label="Hours taught" value={a.classes.hours_taught} />
        <Tile label="Upcoming" value={a.classes.upcoming} />
        <Tile label="Courses" value={d.stats.courses} />
        <Tile label="Students" value={d.stats.students} />
        <Tile label="Logins" value={a.total_logins} />
      </div>
      <Section title="Quick summary">
        <Facts
          items={[
            ['Last login', dt(a.last_login_at)],
            ['Last seen', dt(a.last_seen_at)],
            ['Last class taken', dt(a.classes.last_class_at)],
            ['Next class', dt(a.classes.next_class_at)],
            ['Average rating', a.teaching.average_rating !== null ? `${a.teaching.average_rating} / 5 (${a.teaching.reviews_received})` : '-'],
            ['Joined', formatDate(a.joined_at)]
          ]}
        />
      </Section>
      <Section title="Profile">
        <Facts items={[['Phone', d.tutor.phone], ['City', p.city], ['Country', p.country], ['Website', p.website], ['LinkedIn', p.linkedin_url]]} />
        {p.bio && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{p.bio}</p>}
      </Section>
    </div>
  );
}

function Classes({ d }) {
  const c = d.activity.classes;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Total scheduled" value={c.total} />
        <Tile label="Taken" value={c.completed} />
        <Tile label="Cancelled" value={c.cancelled} />
        <Tile label="Upcoming" value={c.upcoming} />
        <Tile label="Recorded" value={c.recorded} />
        <Tile label="Hours taught" value={c.hours_taught} />
      </div>
      {c.by_month.length > 0 && (
        <Section title="Classes taken per month (last 6 months)">
          <DataTable
            rows={c.by_month}
            columns={[
              { key: 'month', header: 'Month' },
              { key: 'classes', header: 'Classes' },
              { key: 'hours', header: 'Hours' }
            ]}
          />
        </Section>
      )}
      <Section title="Latest live classes">
        <DataTable
          rows={c.recent}
          empty="No live classes yet."
          columns={[
            { key: 'title', header: 'Class', render: (x) => <span className="font-medium text-slate-900">{x.title}</span> },
            { key: 'course_title', header: 'Course', render: (x) => x.course_title || '-' },
            { key: 'scheduled_start', header: 'When', render: (x) => dt(x.scheduled_start) },
            { key: 'status', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
            { key: 'attendance', header: 'Attended', render: (x) => (x.registered ? `${x.joined} of ${x.registered}` : '-') },
            { key: 'recording', header: 'Recording', render: (x) => humanize(x.recording_status) }
          ]}
        />
      </Section>
    </div>
  );
}

function Teaching({ d }) {
  const t = d.activity.teaching;
  return (
    <div className="space-y-5">
      <Section title="Students">
        <Facts
          items={[
            ['Students enrolled', t.students_enrolled],
            ['Students completed', t.students_completed],
            ['Completion rate', pct(t.completion_rate)],
            ['Certificates issued', t.certificates_issued],
            ['Average rating', t.average_rating !== null ? `${t.average_rating} / 5` : '-'],
            ['Reviews received', t.reviews_received]
          ]}
        />
      </Section>
      <Section title="Work done">
        <Facts
          items={[
            ['Projects reviewed', t.projects_reviewed],
            ['Approved / rejected', `${t.projects_approved} / ${t.projects_rejected}`],
            ['Last project review', dt(t.last_project_review_at)],
            ['Videos uploaded', t.videos_uploaded],
            ['Community posts', t.community_posts],
            ['Community comments', t.community_comments]
          ]}
        />
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
            ['Account status', humanize(a.account_status || d.tutor.status)],
            ['Online now', a.is_online ? 'Yes' : 'No'],
            ['Last login', dt(a.last_login_at)],
            ['Last logout', dt(a.last_logout_at)],
            ['Last seen', dt(a.last_seen_at)],
            ['Total logins', a.total_logins],
            ['Active sessions', a.active_sessions],
            ['Joined', formatDate(a.joined_at)]
          ]}
        />
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Devices used to log in">
          <Breakdown data={a.logins_by_device} labels={DEVICE_LABEL} icons={DEVICE_ICON} empty="No logins recorded yet." />
        </Section>
        <Section title="Operating systems">
          <Breakdown data={a.logins_by_os} empty="No logins recorded yet." />
        </Section>
      </div>
      <Section title="Login history (latest 30)">
        <DataTable
          rows={a.sessions}
          empty="No sessions recorded yet. Sessions are tracked at each login."
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
    <Section title={`Assigned courses (${d.courses.length})`}>
      <DataTable
        rows={d.courses}
        empty="No courses assigned."
        columns={[
          { key: 'title', header: 'Course', render: (c) => <span className="font-medium text-slate-900">{c.title}{c.is_primary ? ' (primary)' : ''}</span> },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          { key: 'student_count', header: 'Students', render: (c) => c.student_count ?? '-' },
          { key: 'created_at', header: 'Created', render: (c) => formatDate(c.created_at) }
        ]}
      />
    </Section>
  );
}

function Earnings({ d }) {
  const e = d.earnings;
  return (
    <div className="space-y-5">
      <Section title="Earnings">
        <Facts
          items={[
            ['Revenue from courses', formatPrice(e.total_revenue || 0)],
            ['Tutor share', e.share_percent !== undefined ? `${e.share_percent}%` : '-'],
            ['Total earnings', formatPrice(e.total_earnings || 0)],
            ['Paid out', formatPrice(e.total_paid_out || 0)],
            ['Pending payouts', formatPrice(e.pending_payouts || 0)],
            ['Balance', formatPrice(e.balance || 0)]
          ]}
        />
      </Section>
      <Section title="Recent payouts">
        <DataTable
          rows={d.recent_payouts}
          empty="No payouts yet."
          columns={[
            { key: 'amount', header: 'Amount', render: (p) => formatPrice(p.amount) },
            { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
            { key: 'created_at', header: 'Created', render: (p) => formatDate(p.created_at) }
          ]}
        />
      </Section>
    </div>
  );
}
