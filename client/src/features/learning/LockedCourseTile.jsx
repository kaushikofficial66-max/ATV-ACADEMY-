'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { assetUrl, cn, formatDuration, formatPrice } from '@/lib/utils';

/** "Included in the Pro and Complete plans" for a locked course. */
export const lockMessage = (includedIn = []) => {
  const names = includedIn.map((p) => p.name);
  if (!names.length) return 'Not part of your plan';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Included in the ${list} plan${names.length === 1 ? '' : 's'}`;
};

/**
 * A course the student can see but cannot open: greyed out, with the reason and what it costs on its own.
 * Phones: compact row (like CourseTile); sm and up: card.
 */
export default function LockedCourseTile({ course, className }) {
  const href = `/student/locked/${course.id}`;
  const best = (course.upgrade_options || [])[0];
  const price = best && Number(best.price) > 0 ? formatPrice(best.price) : null;
  return (
    <article className={cn('group flex overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm transition sm:flex-col sm:hover:shadow-md', className)} aria-label={`${course.title} (locked)`}>
      <Link href={href} className="relative block w-28 shrink-0 self-stretch overflow-hidden bg-gradient-to-br from-slate-500 to-slate-400 sm:aspect-video sm:w-auto sm:self-auto" tabIndex={-1} aria-hidden>
        {course.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(course.thumbnail_url)} alt="" className="absolute inset-0 size-full object-cover opacity-60 grayscale" />
        )}
        {!course.thumbnail_url && <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-white/40 sm:text-4xl">{(course.title || '?').slice(0, 1).toUpperCase()}</span>}
        <span className="absolute inset-0 flex items-center justify-center bg-slate-900/30">
          <span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow">
            <Lock className="size-5" aria-hidden />
          </span>
        </span>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-5">
        <Link href={href} className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-700 hover:text-slate-900 sm:text-base">
          {course.title}
        </Link>
        <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-700">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{lockMessage(course.included_in)}</span>
        </p>
        {course.lecture_count > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            {course.lecture_count} lecture{course.lecture_count === 1 ? '' : 's'} · {formatDuration(course.duration_seconds)}
          </p>
        )}
        <div className="mt-auto pt-3 sm:pt-4">
          <Link
            href={href}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-brand-300 bg-white text-sm font-medium text-brand-800 transition hover:bg-brand-50 sm:h-10"
          >
            <Lock className="size-4" aria-hidden /> {price ? `Upgrade to ${best.name} · ${price}` : 'View details'}
          </Link>
        </div>
      </div>
    </article>
  );
}
