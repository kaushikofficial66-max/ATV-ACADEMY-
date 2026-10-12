'use client';

import Link from 'next/link';
import { PlayCircle } from 'lucide-react';
import { ProgressBar, StatusBadge } from '@/components/ui';
import { assetUrl, cn } from '@/lib/utils';

/**
 * A learner's course card: cover, title, progress and a clear action.
 * Phones: compact horizontal row (small cover left, details right). sm and up: the large card.
 */
export default function CourseTile({ id, title, thumbnail, tutors, pct = 0, status, statusLabel, className }) {
  const href = `/student/learn/${id}`;
  const started = Number(pct) > 0;
  const finished = status === 'completed' || Number(pct) >= 100;
  return (
    <article
      className={cn(
        'group flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition sm:flex-col sm:hover:-translate-y-0.5 sm:hover:shadow-md',
        className
      )}
    >
      <Link
        href={href}
        className="relative block w-28 shrink-0 self-stretch overflow-hidden bg-gradient-to-br from-brand-700 to-brand-500 sm:aspect-video sm:w-auto sm:self-auto"
        tabIndex={-1}
        aria-hidden
      >
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(thumbnail)} alt="" className="absolute inset-0 size-full object-cover transition duration-300 sm:group-hover:scale-[1.03]" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-white/40 sm:text-4xl">{(title || '?').slice(0, 1).toUpperCase()}</span>
        )}
        <span className="absolute inset-0 hidden items-center justify-center bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/25 group-hover:opacity-100 sm:flex">
          <PlayCircle className="size-12 text-white drop-shadow" />
        </span>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-5">
        <Link href={href} className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 hover:text-brand-800 sm:text-base">
          {title}
        </Link>
        {tutors && <p className="mt-0.5 truncate text-xs text-slate-500 sm:mt-1">{tutors}</p>}
        <div className="mt-auto pt-3 sm:pt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs sm:mb-2">
            <StatusBadge status={status} label={statusLabel} />
            <span className="font-semibold text-slate-700">{Math.round(Number(pct) || 0)}%</span>
          </div>
          <ProgressBar value={pct} />
          <Link
            href={href}
            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 text-sm font-medium text-white transition hover:bg-brand-800 active:bg-brand-800 sm:mt-4 sm:h-10"
          >
            <PlayCircle className="size-4" aria-hidden /> {finished ? 'Review course' : started ? 'Continue learning' : 'Start course'}
          </Link>
        </div>
      </div>
    </article>
  );
}
