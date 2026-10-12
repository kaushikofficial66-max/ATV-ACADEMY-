'use client';

import { Card, ProgressBar, ProgressRing, StatusBadge } from '@/components/ui';

/** Friendly one-liner under the progress ring, from the 90% completion rule. */
export const progressHint = (p) => {
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

/**
 * Course progress card (ring + status + counts). Lectures/videos take the course up to the cap,
 * the approved final project takes it to 100%.
 */
export default function ProgressSummary({ progress }) {
  if (!progress) return null;
  const pct = Number(progress.completion_percentage || 0);
  const cap = progress.progress_cap_percentage;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <ProgressRing value={pct} size={72} stroke={7} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Your progress</p>
          <div className="mt-1">
            <StatusBadge status={progress.status} label={progress.status_label} />
          </div>
        </div>
      </div>
      <div className="relative mt-4">
        <ProgressBar value={pct} />
        {progress.requires_project && cap < 100 && (
          <span className="absolute -top-1 h-4 w-0.5 bg-slate-400" style={{ left: `${cap}%` }} title={`${cap}% - final project unlocks`} aria-hidden />
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{progressHint(progress)}</p>
      {progress.total_lectures > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {progress.completed_lectures} of {progress.total_lectures} lectures completed
        </p>
      )}
    </Card>
  );
}
