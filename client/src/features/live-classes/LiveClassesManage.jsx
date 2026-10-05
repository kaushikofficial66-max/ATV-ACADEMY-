'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { get, post, patch, del, getErrorMessage } from '@/lib/api/client';
import { EP, manage } from '@/lib/api/endpoints';
import { Button, Field, Input, PageHeader, Select, StatusBadge, Textarea } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import ResourceList from '@/components/data/ResourceList';
import TutorPicker from '@/components/data/TutorPicker';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiMutation } from '@/hooks/useApiMutation';
import { builderKeys } from '@/features/course-builder/keys';
import { formatDateTime, fullName } from '@/lib/utils';

/** Schedule Zoom classes, start them as host, change status. */
export default function LiveClassesManage({ role }) {
  const m = manage(role);
  const key = builderKeys.liveClasses(role);
  const [creating, setCreating] = useState(false);
  const setStatus = useApiMutation(({ id, status }) => patch(m.liveClassStatus(id), { status }), { invalidate: [key] });
  const remove = useApiMutation((id) => del(m.liveClass(id)), { invalidate: [key] });

  const start = async (lc) => {
    const tab = window.open('', '_blank');
    try {
      const res = await get(m.liveClassStart(lc.id));
      if (tab) tab.location.href = res.data.start_url;
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
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Schedule class
          </Button>
        }
      />
      <ResourceList
        queryKey={key}
        endpoint={m.liveClasses}
        dataKey="live_classes"
        search={false}
        filters={[{ name: 'status', label: 'Status', options: ['scheduled', 'live', 'completed', 'cancelled'] }]}
        renderAbove={(data) =>
          data && !data.zoom_configured && <p className="bg-amber-50 px-4 py-2 text-sm text-amber-800">Zoom is not configured - add meeting links manually or set Zoom credentials in Admin &gt; Settings.</p>
        }
        empty="No live classes scheduled."
        columns={[
          { key: 'title', header: 'Class', render: (c) => <span className="font-medium text-slate-900">{c.title}</span> },
          { key: 'course', header: 'Course', render: (c) => c.course?.title },
          {
            key: 'tutors',
            header: 'Tutors',
            render: (c) => {
              const list = c.tutors?.length ? c.tutors : c.tutor ? [c.tutor] : [];
              return list.map((t) => fullName(t) + (t.id === c.tutor_id && list.length > 1 ? ' (host)' : '')).join(', ') || '-';
            }
          },
          { key: 'scheduled_start', header: 'Starts', render: (c) => formatDateTime(c.scheduled_start) },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          {
            key: 'actions',
            header: '',
            render: (c) => (
              <div className="flex justify-end gap-2">
                {['scheduled', 'live'].includes(c.status) && (
                  <>
                    <Button size="sm" onClick={() => start(c)}>
                      Start
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: c.id, status: c.status === 'live' ? 'completed' : 'cancelled' })}>
                      {c.status === 'live' ? 'End' : 'Cancel'}
                    </Button>
                  </>
                )}
                {c.status !== 'live' && (
                  <Button size="sm" variant="ghost" onClick={() => confirm('Delete this class?') && remove.mutate(c.id)}>
                    Delete
                  </Button>
                )}
              </div>
            )
          }
        ]}
      />
      <Modal open={creating} onClose={() => setCreating(false)} title="Schedule a live class" size="lg">
        {creating && <LiveClassForm role={role} onDone={() => setCreating(false)} />}
      </Modal>
    </>
  );
}

function LiveClassForm({ role, onDone }) {
  const m = manage(role);
  const isAdmin = role === 'admin';
  const { user } = useAuth();
  const courses = useQuery({
    queryKey: builderKeys.courses(role).concat('options'),
    queryFn: () => get(isAdmin ? EP.admin.courses : m.courses, { limit: 100 }).then((r) => r.data.courses)
  });
  const [v, setV] = useState({ course_id: '', title: '', description: '', scheduled_start: '', scheduled_end: '', zoom_join_url: '' });
  const [picked, setPicked] = useState({ ids: [], mainId: null });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  // Only tutors assigned to the selected course can take the class.
  const courseTutors = useQuery({
    queryKey: [...builderKeys.course(role, v.course_id), 'tutors'],
    queryFn: () => get(m.course(v.course_id)).then((r) => r.data.course.tutors || []),
    enabled: Boolean(v.course_id)
  });

  const selectCourse = (e) => {
    setV((s) => ({ ...s, course_id: e.target.value }));
    // A tutor scheduling a class is always its host; admins choose.
    setPicked(isAdmin ? { ids: [], mainId: null } : { ids: [user.id], mainId: user.id });
  };

  // Admin with a single-tutor course: that tutor is preselected.
  const tutors = courseTutors.data || [];
  const effective = isAdmin && !picked.ids.length && tutors.length === 1 ? { ids: [tutors[0].id], mainId: tutors[0].id } : picked;

  const save = useApiMutation(
    () =>
      post(m.liveClasses, {
        ...v,
        scheduled_start: new Date(v.scheduled_start).toISOString(),
        scheduled_end: new Date(v.scheduled_end).toISOString(),
        zoom_join_url: v.zoom_join_url || undefined,
        tutor_ids: effective.ids,
        tutor_id: effective.mainId || undefined
      }),
    { invalidate: [builderKeys.liveClasses(role)], onSuccess: onDone }
  );

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Course" htmlFor="lc_course" required className="sm:col-span-2">
        <Select id="lc_course" value={v.course_id} onChange={selectCourse} required>
          <option value="">Select a course</option>
          {courses.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
      </Field>
      {v.course_id && (
        <Field
          label={isAdmin ? 'Tutors' : 'Co-tutors'}
          required={isAdmin}
          hint={isAdmin ? 'Select one or more tutors. The host starts the Zoom meeting.' : 'You are the host. Optionally add other tutors of this course.'}
          className="sm:col-span-2"
        >
          {courseTutors.isPending ? (
            <p className="text-sm text-slate-500">Loading tutors...</p>
          ) : (
            <TutorPicker
              tutors={tutors}
              value={effective}
              onChange={setPicked}
              locked={isAdmin ? [] : [user.id]}
              empty={
                isAdmin ? (
                  <>
                    This course has no tutors yet.{' '}
                    <Link href={`/admin/courses/${v.course_id}`} className="text-brand-700 hover:underline">
                      Assign tutors to the course
                    </Link>{' '}
                    first.
                  </>
                ) : (
                  'No other tutors on this course.'
                )
              }
            />
          )}
        </Field>
      )}
      <Field label="Title" htmlFor="lc_title" required className="sm:col-span-2">
        <Input id="lc_title" value={v.title} onChange={set('title')} required />
      </Field>
      <Field label="Starts" htmlFor="lc_start" required>
        <Input id="lc_start" type="datetime-local" value={v.scheduled_start} onChange={set('scheduled_start')} required />
      </Field>
      <Field label="Ends" htmlFor="lc_end" required>
        <Input id="lc_end" type="datetime-local" value={v.scheduled_end} onChange={set('scheduled_end')} required />
      </Field>
      <Field label="Description" htmlFor="lc_description" className="sm:col-span-2">
        <Textarea id="lc_description" rows={3} value={v.description} onChange={set('description')} />
      </Field>
      <Field label="Meeting link" htmlFor="lc_url" hint="Leave empty to create a Zoom meeting automatically" className="sm:col-span-2">
        <Input id="lc_url" type="url" value={v.zoom_join_url} onChange={set('zoom_join_url')} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={save.isPending} disabled={isAdmin && !effective.ids.length}>
          Schedule
        </Button>
      </div>
    </form>
  );
}

