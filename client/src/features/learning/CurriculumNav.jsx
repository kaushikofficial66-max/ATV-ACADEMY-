'use client';

import Link from 'next/link';
import { CircleCheck, Circle, FileText, PlayCircle, HelpCircle, Video } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';

const TYPE_ICON = { video: PlayCircle, text: FileText, document: FileText, quiz: HelpCircle, live_class: Video };

/** Sections + lectures with completion ticks; highlights the active lecture. */
export default function CurriculumNav({ courseId, curriculum = [], activeLectureId }) {
  return (
    <nav aria-label="Course content" className="divide-y divide-slate-100">
      {curriculum.map((section, i) => (
        <div key={section.id} className="py-2">
          <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {i + 1}. {section.title}
            <span className="ml-1 font-normal normal-case">
              ({section.completed_lectures}/{section.total_lectures})
            </span>
          </p>
          <ul>
            {section.lectures.map((l) => {
              const Icon = TYPE_ICON[l.lecture_type] || FileText;
              const active = String(l.id) === String(activeLectureId);
              return (
                <li key={l.id}>
                  <Link
                    href={`/student/learn/${courseId}/lecture/${l.id}`}
                    className={cn('flex items-start gap-3 px-4 py-2 text-sm hover:bg-slate-50', active && 'bg-brand-50 text-brand-800')}
                    aria-current={active ? 'page' : undefined}
                  >
                    {l.progress?.completed ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-600" aria-label="Completed" /> : <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" aria-hidden />}
                    <span className="min-w-0 flex-1">{l.title}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                      <Icon className="size-3.5" aria-hidden />
                      {l.duration_seconds ? formatDuration(l.duration_seconds) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
