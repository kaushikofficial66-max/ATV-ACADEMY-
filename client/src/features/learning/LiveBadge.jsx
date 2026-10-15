import { cn } from '@/lib/utils';

/**
 * Marks a lecture that belongs to a live class.
 *  - class is on right now -> solid red, pulsing "LIVE"
 *  - otherwise (upcoming / recording) -> soft "Live class" tag
 */
export default function LiveBadge({ status, className }) {
  if (status === 'live') {
    return (
      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white', className)}>
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-white" />
        </span>
        Live
      </span>
    );
  }
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-inset ring-rose-600/20', className)}>
      <span className="size-1.5 rounded-full bg-rose-500" aria-hidden />
      Live class
    </span>
  );
}
