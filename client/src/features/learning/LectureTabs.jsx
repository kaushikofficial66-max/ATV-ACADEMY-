'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, HelpCircle } from 'lucide-react';
import { get, downloadFile } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Textarea } from '@/components/ui';
import ReviewForm from '@/features/reviews/ReviewForm';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'notes', label: 'Notes' },
  { id: 'rating', label: 'Rating' }
];

/** Personal notes for a lecture, kept in this browser (no server round trip needed). */
const readNote = (key) => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

function NotesPanel({ lectureId }) {
  const key = `atv_notes_${lectureId}`;
  const [text, setText] = useState(() => readNote(key));
  const [saved, setSaved] = useState(null); // null | 'saving' | 'saved' | 'unavailable'
  const timer = useRef(null);

  const onChange = (e) => {
    const value = e.target.value;
    setText(value);
    setSaved('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (value) window.localStorage.setItem(key, value);
        else window.localStorage.removeItem(key);
        setSaved('saved');
      } catch {
        setSaved('unavailable');
      }
    }, 600);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div>
      <label htmlFor="lecture-notes" className="mb-2 block text-sm font-semibold text-slate-900">
        Your notes for this lecture
      </label>
      <Textarea id="lecture-notes" rows={7} value={text} onChange={onChange} placeholder="Type anything you want to remember..." />
      <p className="mt-2 text-xs text-slate-500">
        {saved === 'saving' && 'Saving...'}
        {saved === 'saved' && 'Saved on this device.'}
        {saved === 'unavailable' && 'Notes could not be saved in this browser.'}
        {saved === null && 'Notes are private and saved on this device.'}
      </p>
    </div>
  );
}

/** Rate the course; pre-fills an earlier review so it can be edited. */
function RatingPanel({ courseId }) {
  const reviews = useQuery({ queryKey: ['student', 'reviews'], queryFn: () => get(EP.student.reviews).then((r) => r.data.reviews) });
  const mine = reviews.data?.find((r) => String(r.course?.id ?? r.course_id) === String(courseId));
  if (reviews.isPending) return <p className="text-sm text-slate-500">Loading...</p>;
  return (
    <div className="max-w-xl">
      <p className="mb-4 text-sm font-semibold text-slate-900">{mine ? 'Update your rating' : 'How is this course going?'}</p>
      <ReviewForm key={mine?.id || 'new'} courseId={courseId} initial={mine} />
    </div>
  );
}

/** Overview / Attachments / Notes / Rating below the video. */
export default function LectureTabs({ courseId, lectureId, lecture, canRate }) {
  const [tab, setTab] = useState('overview');
  const resources = lecture.resources || [];
  const quizzes = lecture.quizzes || [];
  const tabs = TABS.filter((t) => (t.id === 'rating' ? canRate : true));

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm sm:mt-6">
      <div role="tablist" aria-label="Lecture details" className="flex gap-5 overflow-x-auto border-b border-slate-200 px-4 sm:gap-6 sm:px-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 py-3.5 text-sm font-medium transition-colors',
              tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {t.label}
            {t.id === 'attachments' && resources.length > 0 && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{resources.length}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="p-4 sm:p-6">
        {tab === 'overview' && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{lecture.lecture.section?.title}</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">{lecture.lecture.title}</h2>
            </div>
            {lecture.lecture.description ? (
              <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{lecture.lecture.description}</div>
            ) : (
              <p className="text-sm text-slate-500">No description for this lecture.</p>
            )}
            {quizzes.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Practice</p>
                <div className="flex flex-wrap gap-2">
                  {quizzes.map((q) => (
                    <Button key={q.id} href={`/student/quizzes/${q.id}`} variant="secondary" size="sm">
                      <HelpCircle className="size-4" aria-hidden /> Quiz: {q.title}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'attachments' &&
          (resources.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <FileText className="size-4" aria-hidden /> No attachments for this lecture.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {resources.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-slate-800">
                    <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="truncate">{r.title || r.file_name}</span>
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => downloadFile(EP.student.resourceDownload(r.id), r.file_name)}>
                    <Download className="size-4" aria-hidden /> Download
                  </Button>
                </li>
              ))}
            </ul>
          ))}

        {tab === 'notes' && <NotesPanel key={lectureId} lectureId={lectureId} />}
        {tab === 'rating' && canRate && <RatingPanel courseId={courseId} />}
      </div>
    </div>
  );
}

