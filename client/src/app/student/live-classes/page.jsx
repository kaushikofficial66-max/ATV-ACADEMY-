'use client';

import { useState } from 'react';
import { toast } from 'react-toastify';
import { post, getErrorMessage } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { formatDateTime } from '@/lib/utils';

const SCOPES = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' }
];

export default function StudentLiveClassesPage() {
  const [scope, setScope] = useState('upcoming');

  const join = async (lc) => {
    // Open the tab synchronously so pop-up blockers allow it.
    const tab = window.open('', '_blank');
    try {
      const res = await post(EP.student.liveClassJoin(lc.id));
      if (tab) tab.location.href = res.data.join_url;
      else window.location.href = res.data.join_url;
    } catch (err) {
      tab?.close();
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Live classes"
        actions={
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setScope(s.value)}
                className={`rounded-md px-3 py-1 text-sm ${scope === s.value ? 'bg-brand-700 text-white' : 'text-slate-600'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        }
      />
      <ResourceList
        key={scope}
        queryKey={['student', 'live-classes']}
        endpoint={EP.student.liveClasses}
        dataKey="live_classes"
        params={{ scope }}
        search={false}
        empty={scope === 'upcoming' ? 'No upcoming live classes.' : 'No past live classes.'}
        columns={[
          { key: 'title', header: 'Class', render: (c) => <span className="font-medium text-slate-900">{c.title}</span> },
          { key: 'course', header: 'Course', render: (c) => c.course?.title },
          { key: 'scheduled_start', header: 'Starts', render: (c) => formatDateTime(c.scheduled_start) },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          {
            key: 'join',
            header: '',
            render: (c) =>
              scope === 'upcoming' &&
              (c.can_join ? (
                <Button size="sm" onClick={() => join(c)}>
                  Join
                </Button>
              ) : (
                <span className="text-xs text-slate-500">Opens {formatDateTime(c.join_opens_at)}</span>
              ))
          }
        ]}
      />
    </>
  );
}
