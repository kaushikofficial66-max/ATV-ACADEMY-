'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, CircleCheck, FileText, HelpCircle, PlayCircle, Video } from 'lucide-react';
import { cn, formatDuration, formatDateTime } from '@/lib/utils';
import LiveBadge from './LiveBadge';

const TYPE_ICON = { video: PlayCircle, text: FileText, document: FileText, quiz: HelpCircle, live_class: Video };
const pad = (n) => String(n).padStart(2, '0');

/** Which module should be open first: the one with the active lecture, else the first unfinished one. */
const initialOpen = (curriculum, activeLectureId, openAll) => {
  if (openAll) return new Set(curriculum.map((s) => s.id));
  const withActive = curriculum.find((s) => s.lectures.some((l) => String(l.id) === String(activeLectureId)));
  const firstOpen = curriculum.find((s) => s.completed_lectures < s.total_lectures) || curriculum[0];
  return new Set([(withActive || firstOpen)?.id].filter(Boolean));
};

/**
 * Course content as collapsible modules ("Module 01 - Title") with a thin progress line, and a
 * lecture list with completed / playing markers. Used in the player sidebar and the course page.
 */
export default function ModuleList({ courseId, curriculum = [], activeLectureId, openAll = false, onNavigate }) {
  const [open, setOpen] = useState(() => initialOpen(curriculum, activeLectureId, openAll));
  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!curriculum.length) return <p className="px-5 py-6 text-sm text-slate-500">The course content will appear here soon.</p>;

  return (
    <nav aria-label="Course content">
      {curriculum.map((section, i) => {
        const isOpen = open.has(section.id);
        const pct = section.total_lectures ? Math.round((section.completed_lectures / section.total_lectures) * 100) : 0;
        return (
          <section key={section.id} className="border-b border-slate-200 last:border-b-0">
            <button
              type="button"
              onClick={() => toggle(section.id)}
              aria-expanded={isOpen}
              className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-slate-900">Module {pad(i + 1)}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-slate-600">{section.title}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {section.completed_lectures}/{section.total_lectures} completed
                </span>
              </span>
              <ChevronDown className={cn('mt-1 size-4 shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-180')} aria-hidden />
            </button>
            <div className="h-[3px] w-full bg-slate-100" aria-hidden>
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>

            {isOpen && (
              <ol className="relative py-2">
                {section.lectures.map((l, idx) => {
                  const Icon = TYPE_ICON[l.lecture_type] || FileText;
                  const active = String(l.id) === String(activeLectureId);
                  const done = Boolean(l.progress?.completed);
                  return (
                    <li key={l.id} className="relative">
                      {/* dotted timeline between lectures */}
                      {idx < section.lectures.length - 1 && <span className="absolute left-[29px] top-9 h-[calc(100%-18px)] border-l border-dashed border-slate-300" aria-hidden />}
                      <Link
                        href={`/student/learn/${courseId}/lecture/${l.id}`}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative flex items-start gap-3 px-5 py-3 text-sm transition',
                          active ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        )}
                      >
                        {active && <span className="absolute inset-y-0 left-0 w-1 bg-brand-600" aria-hidden />}
                        <span className="relative z-10 mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-white">
                          {done ? (
                            <CircleCheck className="size-[18px] text-emerald-500" aria-label="Completed" />
                          ) : (
                            <Icon className={cn('size-[18px]', active ? 'text-brand-700' : 'text-slate-400')} aria-hidden />
                          )}
                        </span>
                        <span className={cn('min-w-0 flex-1 leading-snug', active && 'font-semibold')}>
                          {l.title}
                          {l.lecture_type === 'live_class' && (
                            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <LiveBadge status={l.liveClass?.status} />
                              {l.liveClass?.status === 'scheduled' && <span className="text-xs font-normal text-slate-500">{formatDateTime(l.liveClass.scheduled_start)}</span>}
                            </span>
                          )}
                        </span>
                        {l.duration_seconds ? <span className="shrink-0 pt-0.5 text-xs tabular-nums text-slate-400">{formatDuration(l.duration_seconds)}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </nav>
  );
}
