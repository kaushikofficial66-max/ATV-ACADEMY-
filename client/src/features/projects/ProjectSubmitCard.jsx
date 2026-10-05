'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock, Upload } from 'lucide-react';
import { get, upload, downloadFile } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, CardHeader, Field, Input, ProgressBar, StatusBadge, Textarea } from '@/components/ui';
import { useApiMutation } from '@/hooks/useApiMutation';
import { learningKeys } from '@/features/learning/keys';
import { formatDateTime } from '@/lib/utils';

/**
 * Final project for a course (phase 2 of the 90% rule). Locked until the
 * student reaches the cap; then a file can be submitted. A rejected project
 * can be resubmitted.
 */
export default function ProjectSubmitCard({ courseId, summary }) {
  // Courses without a final project get `project: null` from the API.
  if (!summary) return null;
  return <ProjectCard courseId={courseId} summary={summary} />;
}

function ProjectCard({ courseId, summary }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [pct, setPct] = useState(0);

  const detail = useQuery({
    queryKey: ['student', 'project', String(courseId)],
    queryFn: () => get(EP.student.courseProject(courseId)).then((r) => r.data)
  });

  const submit = useApiMutation(
    () => {
      const fd = new FormData();
      fd.append('project_file', file);
      if (note) fd.append('submission_note', note);
      return upload(EP.student.projectSubmit(summary.id), fd, { onProgress: setPct });
    },
    {
      success: 'Project submitted. It is now pending approval.',
      invalidate: [learningKeys.player(courseId), ['student', 'project', String(courseId)], ['student', 'dashboard']],
      onSuccess: () => {
        setFile(null);
        setNote('');
        setPct(0);
      }
    }
  );

  const project = detail.data?.project;
  const latest = summary.latest_submission;

  return (
    <Card>
      <CardHeader title="Final project" description={summary.title} action={latest && <StatusBadge status={latest.status} />} />
      <div className="space-y-4 p-5 text-sm">
        {project?.description && <p className="whitespace-pre-line text-slate-600">{project.description}</p>}
        {project?.instructions && (
          <div className="rounded-lg bg-slate-50 p-3 text-slate-600">
            <p className="mb-1 font-medium text-slate-700">Instructions</p>
            <p className="whitespace-pre-line">{project.instructions}</p>
          </div>
        )}

        {latest && (
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-slate-700">Last submitted {formatDateTime(latest.submitted_at)}</p>
            {latest.tutor_feedback && <p className="mt-1 text-slate-600">Feedback: {latest.tutor_feedback}</p>}
            <Button variant="link" size="sm" className="mt-1" onClick={() => downloadFile(EP.student.submissionDownload(latest.id), 'project')}>
              Download my submission
            </Button>
          </div>
        )}

        {!summary.is_eligible ? (
          <p className="flex items-center gap-2 text-slate-500">
            <Lock className="size-4" aria-hidden /> Unlocks when your progress reaches {summary.eligibility_threshold}%.
          </p>
        ) : summary.can_submit ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (file) submit.mutate();
            }}
          >
            <Field label="Project file" htmlFor="project_file" required hint={project?.allowed_file_types?.length ? `Allowed: ${[].concat(project.allowed_file_types).join(', ')}` : undefined}>
              <Input id="project_file" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="pt-2" />
            </Field>
            <Field label="Note for your tutor" htmlFor="submission_note">
              <Textarea id="submission_note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {submit.isPending && <ProgressBar value={pct} />}
            <Button type="submit" loading={submit.isPending} disabled={!file}>
              <Upload className="size-4" aria-hidden /> {latest ? 'Resubmit project' : 'Submit project'}
            </Button>
          </form>
        ) : (
          latest && ['submitted', 'under_review'].includes(latest.status) && <p className="text-slate-500">Your project is pending approval.</p>
        )}
      </div>
    </Card>
  );
}
