'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post, put, del } from '@/lib/api/client';
import { manage } from '@/lib/api/endpoints';
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { builderKeys } from './keys';

/**
 * The course's final project. Students unlock it at the progress cap (90%)
 * and complete the course when it is approved.
 */
export default function ProjectManager({ role, courseId }) {
  const m = manage(role);
  const key = builderKeys.projects(role, courseId);
  const query = useQuery({ queryKey: key, queryFn: () => get(m.projects(courseId)).then((r) => r.data.projects) });

  return (
    <QueryState query={query} loading={<Loader />}>
      {(projects) => <ProjectForm key={projects[0]?.id || 'new'} role={role} courseId={courseId} project={projects[0]} />}
    </QueryState>
  );
}

function ProjectForm({ role, courseId, project }) {
  const m = manage(role);
  const invalidate = [builderKeys.projects(role, courseId), builderKeys.course(role, courseId)];
  const [v, setV] = useState({
    title: project?.title || '',
    instructions: project?.instructions || '',
    allowed_file_types: [].concat(project?.allowed_file_types || ['pdf', 'zip']).join(', '),
    max_file_size_mb: project?.max_file_size ? Math.round(project.max_file_size / 1024 / 1024) : 50,
    status: project?.status || 'active'
  });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const save = useApiMutation((body) => (project ? put(m.project(project.id), body) : post(m.projects(courseId), body)), { invalidate });
  const remove = useApiMutation(() => del(m.project(project.id)), { invalidate });

  return (
    <Card className="max-w-3xl">
      <CardHeader
        title={project ? 'Final project' : 'Add a final project'}
        description="Students unlock the project at 90% progress. Approving their submission completes the course (100%) and issues the certificate."
      />
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            ...v,
            allowed_file_types: v.allowed_file_types.split(',').map((t) => t.trim()).filter(Boolean),
            max_file_size_mb: Number(v.max_file_size_mb) || undefined
          });
        }}
      >
        <Field label="Title" htmlFor="project_title" required className="sm:col-span-2">
          <Input id="project_title" value={v.title} onChange={set('title')} required />
        </Field>
        <Field label="Instructions" htmlFor="project_instructions" className="sm:col-span-2">
          <Textarea id="project_instructions" rows={8} value={v.instructions} onChange={set('instructions')} />
        </Field>
        <Field label="Allowed file types" htmlFor="project_types" hint="Comma separated, e.g. pdf, zip, docx">
          <Input id="project_types" value={v.allowed_file_types} onChange={set('allowed_file_types')} />
        </Field>
        <Field label="Max file size (MB)" htmlFor="project_size">
          <Input id="project_size" type="number" min="1" value={v.max_file_size_mb} onChange={set('max_file_size_mb')} />
        </Field>
        <Field label="Status" htmlFor="project_status">
          <Select id="project_status" value={v.status} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={save.isPending}>
            Save project
          </Button>
          {project && (
            <Button type="button" variant="ghost" onClick={() => confirm('Delete the final project?') && remove.mutate()}>
              Delete
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
