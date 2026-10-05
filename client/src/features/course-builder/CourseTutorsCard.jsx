'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, put } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, CardHeader } from '@/components/ui';
import TutorPicker from '@/components/data/TutorPicker';
import { useApiMutation } from '@/hooks/useApiMutation';
import { builderKeys } from './keys';

/** Admin: assign one or more tutors to a course (one is the primary tutor). */
export default function CourseTutorsCard({ course }) {
  const current = course.tutors || [];
  const [value, setValue] = useState({
    ids: current.map((t) => t.id),
    mainId: (current.find((t) => t.CourseTutor?.is_primary) || current[0])?.id ?? null
  });
  const tutors = useQuery({
    queryKey: ['admin', 'tutor-options'],
    queryFn: () => get(EP.admin.tutors, { status: 'active', limit: 100 }).then((r) => r.data.tutors)
  });
  const save = useApiMutation(
    () => put(EP.admin.courseTutors(course.id), { tutors: value.ids.map((id) => ({ tutor_id: id, is_primary: id === value.mainId })) }),
    { invalidate: [builderKeys.all('admin')] }
  );

  return (
    <Card>
      <CardHeader title="Course tutors" description="Tutors who manage this course and can take its live classes." />
      <div className="space-y-3 p-5">
        <TutorPicker tutors={tutors.data || []} value={value} onChange={setValue} mainLabel="Primary" empty={tutors.isPending ? 'Loading tutors...' : 'No active tutors yet.'} />
        <Button size="sm" loading={save.isPending} disabled={!value.ids.length} onClick={() => save.mutate()}>
          Save tutors
        </Button>
      </div>
    </Card>
  );
}
