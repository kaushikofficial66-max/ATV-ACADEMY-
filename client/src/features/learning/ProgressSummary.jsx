'use client';

import { Card, ProgressBar, StatusBadge } from '@/components/ui';

/**
 * Course progress under the 90% completion rule: lectures/videos take the
 * course up to the cap, the approved final project takes it to 100%.
 */
export default function ProgressSummary({ progress }) {
  if (!progress) return null;
  const pct = Number(progress.completion_percentage || 0);
  const cap = progress.progress_cap_percentage;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">Your progress</p>
        <StatusBadge status={progress.status} label={progress.status_label} />
      </div>
      <p className="mt-3 text-3xl font-semibold text-slate-900">{pct}%</p>
      <div className="relative mt-2">
        <ProgressBar value={pct} />
        {progress.requires_project && cap < 100 && (
          <span className="absolute -top-1 h-4 w-0.5 bg-slate-400" style={{ left: `${cap}%` }} title={`${cap}% - final project unlocks`} aria-hidden />
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">{hint(progress)}</p>
      {progress.total_lectures > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {progress.completed_lectures} of {progress.total_lectures} lectures completed
        </p>
      )}
    </Card>
  );
}

const hint = (p) => {
  switch (p.status) {
    case 'completed':
      return 'Course completed. Your certificate is available.';
    case 'pending_approval':
      return 'Your final project is waiting for approval. You will reach 100% once it is approved.';
    case 'resubmission_required':
      return 'Changes were requested on your final project. Update it and submit again.';
    case 'project_unlocked':
      return 'You unlocked the final project. Submit it to complete the course.';
    default:
      return p.requires_project
        ? `Each lesson you play adds ${p.increment_percentage}% (up to ${p.progress_cap_percentage}%). The final project completes the course.`
        : `Each lesson you play adds ${p.increment_percentage}% to your progress.`;
  }
};
