'use client';

import { useState } from 'react';
import { post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, CardHeader, Field, Input, PageHeader, Select, StatusBadge, Textarea } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { formatDateTime, fullName, humanize } from '@/lib/utils';

const KEY = ['admin', 'communications'];
const AUDIENCES = ['all_users', 'all_students', 'all_tutors', 'student', 'tutor'];

/** Email / WhatsApp messages and in-app announcements. */
export default function AdminCommunicationsPage() {
  return (
    <>
      <PageHeader title="Communications" description="Email / WhatsApp messages and in-app announcements" />
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <MessageForm />
        <AnnouncementForm />
      </div>
      <ResourceList
        queryKey={KEY}
        endpoint={EP.admin.communications}
        dataKey="communications"
        searchPlaceholder="Search messages..."
        filters={[
          { name: 'channel', label: 'Channel', options: ['email', 'whatsapp'] },
          { name: 'status', label: 'Status', options: ['sent', 'failed', 'pending'] }
        ]}
        columns={[
          { key: 'channel', header: 'Channel', render: (c) => humanize(c.channel) },
          { key: 'recipient', header: 'To', render: (c) => (c.recipient ? fullName(c.recipient) : humanize(c.recipient_type)) },
          { key: 'subject', header: 'Message', render: (c) => <span className="line-clamp-2 max-w-md">{c.subject || c.message}</span> },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          { key: 'created_at', header: 'Date', render: (c) => formatDateTime(c.sent_at || c.created_at) }
        ]}
      />
    </>
  );
}

function MessageForm() {
  const blank = { channel: 'email', recipient_type: 'all_students', recipient_id: '', subject: '', message: '' };
  const [v, setV] = useState(blank);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const single = ['student', 'tutor'].includes(v.recipient_type);
  const send = useApiMutation(() => post(EP.admin.communications, { ...v, recipient_id: single ? Number(v.recipient_id) : undefined }), {
    invalidate: [KEY],
    onSuccess: () => setV(blank)
  });

  return (
    <Card>
      <CardHeader title="Send a message" />
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <Field label="Channel" htmlFor="cm_channel">
          <Select id="cm_channel" value={v.channel} onChange={set('channel')}>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </Select>
        </Field>
        <Field label="Recipients" htmlFor="cm_to">
          <Select id="cm_to" value={v.recipient_type} onChange={set('recipient_type')}>
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {['student', 'tutor'].includes(a) ? `One ${a}` : humanize(a)}
              </option>
            ))}
          </Select>
        </Field>
        {single && (
          <Field label={`${humanize(v.recipient_type)} ID`} htmlFor="cm_id" required className="sm:col-span-2">
            <Input id="cm_id" type="number" min="1" value={v.recipient_id} onChange={set('recipient_id')} required />
          </Field>
        )}
        {v.channel === 'email' && (
          <Field label="Subject" htmlFor="cm_subject" className="sm:col-span-2">
            <Input id="cm_subject" value={v.subject} onChange={set('subject')} />
          </Field>
        )}
        <Field label="Message" htmlFor="cm_message" required className="sm:col-span-2">
          <Textarea id="cm_message" rows={4} value={v.message} onChange={set('message')} required />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={send.isPending}>
            Send
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AnnouncementForm() {
  const blank = { audience: 'all_users', title: '', message: '' };
  const [v, setV] = useState(blank);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const send = useApiMutation(() => post(EP.admin.notifications, v), { onSuccess: () => setV(blank) });

  return (
    <Card>
      <CardHeader title="In-app announcement" description="Appears in the notification bell of the selected users" />
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <Field label="Audience" htmlFor="an_audience">
          <Select id="an_audience" value={v.audience} onChange={set('audience')}>
            <option value="all_users">All users</option>
            <option value="all_students">All students</option>
            <option value="all_tutors">All tutors</option>
          </Select>
        </Field>
        <Field label="Title" htmlFor="an_title" required>
          <Input id="an_title" value={v.title} onChange={set('title')} required />
        </Field>
        <Field label="Message" htmlFor="an_message" required>
          <Textarea id="an_message" rows={3} value={v.message} onChange={set('message')} required />
        </Field>
        <Button type="submit" loading={send.isPending}>
          Publish announcement
        </Button>
      </form>
    </Card>
  );
}
