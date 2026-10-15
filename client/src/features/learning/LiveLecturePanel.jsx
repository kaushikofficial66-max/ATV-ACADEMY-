import { Radio, Clock, Hourglass } from 'lucide-react';
import { Button } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';

/**
 * Shown in place of the video for a live-class lecture that has no playable recording yet:
 * upcoming (date + where to join), live now (join), or finished (recording on its way).
 */
export default function LiveLecturePanel({ liveClass }) {
  const status = liveClass?.status;
  let icon = Hourglass;
  let title = 'The recording will appear here soon';
  let text = 'Live class recordings usually take less than an hour to appear after the class ends.';
  let action = null;

  if (status === 'live') {
    icon = Radio;
    title = 'This class is live right now';
    text = 'Join from the Live Classes page.';
    action = (
      <Button href="/student/live-classes" size="sm">
        Join the live class
      </Button>
    );
  } else if (status === 'scheduled') {
    icon = Clock;
    title = `Live class on ${formatDateTime(liveClass.scheduled_start)}`;
    text = 'You can join from the Live Classes page when it starts. The recording will be added to this lecture afterwards.';
    action = (
      <Button href="/student/live-classes" variant="secondary" size="sm">
        Open Live Classes
      </Button>
    );
  }
  const Icon = icon;

  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-rose-200 bg-rose-50/40 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
        <Icon className="size-6" aria-hidden />
      </span>
      <div>
        <p className="text-base font-semibold text-slate-900">{title}</p>
        <p className="mt-1 max-w-md text-sm text-slate-600">{text}</p>
      </div>
      {action}
    </div>
  );
}
