'use client';

import { use, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ChevronLeft, ChevronRight, CircleCheck, Download } from 'lucide-react';
import { get, post, downloadFile } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, CardHeader } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { learningKeys } from '@/features/learning/keys';
import CurriculumNav from '@/features/learning/CurriculumNav';
import ProgressSummary from '@/features/learning/ProgressSummary';
import VideoPlayer from '@/features/videos/VideoPlayer';

const SAVE_EVERY_SECONDS = 15;

export default function LecturePage({ params }) {
  const { courseId, lectureId } = use(params);
  const queryClient = useQueryClient();
  const player = useQuery({ queryKey: learningKeys.player(courseId), queryFn: () => get(EP.student.player(courseId)).then((r) => r.data) });
  const lecture = useQuery({ queryKey: learningKeys.lecture(lectureId), queryFn: () => get(EP.student.lecture(lectureId)).then((r) => r.data) });

  const furthest = useRef(0);
  const lastSaved = useRef(0);
  const refreshPlayer = () => queryClient.invalidateQueries({ queryKey: learningKeys.player(courseId) });

  const saveProgress = (completed = false) =>
    post(EP.student.lectureProgress(lectureId), { watched_seconds: furthest.current, position_seconds: furthest.current, ...(completed && { completed: true }) })
      .then(refreshPlayer)
      .catch(() => {});

  // Each counted play adds the fixed increment (90% rule, phase 1).
  const onPlay = async () => {
    if (!lecture.data?.is_enrolled) return;
    try {
      const res = await post(EP.student.videoPlay(lecture.data.video.id));
      if (res.data?.counted) toast.success(res.message);
      refreshPlayer();
    } catch {
      /* playing still works if counting fails */
    }
  };

  const onTimeUpdate = (seconds) => {
    furthest.current = Math.max(furthest.current, seconds);
    if (lecture.data?.is_enrolled && seconds - lastSaved.current >= SAVE_EVERY_SECONDS) {
      lastSaved.current = seconds;
      saveProgress();
    }
  };

  const complete = useApiMutation(() => post(EP.student.lectureComplete(lectureId)), {
    success: 'Lecture marked as complete',
    invalidate: [learningKeys.player(courseId), learningKeys.lecture(lectureId)]
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <Link href={`/student/learn/${courseId}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" aria-hidden /> {player.data?.course.title || 'Course'}
        </Link>
        <QueryState query={lecture} loading={<Loader />}>
          {(d) => (
            <>
              {d.video ? (
                <VideoPlayer
                  key={d.video.id}
                  playback={d.video.playback}
                  title={d.video.title}
                  startAt={d.video.progress.last_position_seconds}
                  onPlay={onPlay}
                  onTimeUpdate={onTimeUpdate}
                  onEnded={() => d.is_enrolled && saveProgress(true)}
                />
              ) : null}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{d.lecture.section.title}</p>
                  <h1 className="text-xl font-semibold text-slate-900">{d.lecture.title}</h1>
                </div>
                {d.is_enrolled &&
                  (d.progress.completed ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700">
                      <CircleCheck className="size-4" aria-hidden /> Completed
                    </span>
                  ) : (
                    <Button variant="secondary" size="sm" loading={complete.isPending} onClick={() => complete.mutate()}>
                      Mark as complete
                    </Button>
                  ))}
              </div>
              {d.lecture.description && <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{d.lecture.description}</div>}

              {d.resources.length > 0 && (
                <Card>
                  <CardHeader title="Resources" />
                  <ul className="divide-y divide-slate-100">
                    {d.resources.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <span>{r.title || r.file_name}</span>
                        <Button size="sm" variant="ghost" onClick={() => downloadFile(EP.student.resourceDownload(r.id), r.file_name)}>
                          <Download className="size-4" aria-hidden /> Download
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {d.quizzes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {d.quizzes.map((q) => (
                    <Button key={q.id} href={`/student/quizzes/${q.id}`} variant="secondary" size="sm">
                      Quiz: {q.title}
                    </Button>
                  ))}
                </div>
              )}

              <div className="flex justify-between border-t border-slate-200 pt-4">
                {d.navigation.previous ? (
                  <Button href={`/student/learn/${courseId}/lecture/${d.navigation.previous.id}`} variant="ghost" size="sm">
                    <ChevronLeft className="size-4" aria-hidden /> Previous
                  </Button>
                ) : (
                  <span />
                )}
                {d.navigation.next && (
                  <Button href={`/student/learn/${courseId}/lecture/${d.navigation.next.id}`} size="sm">
                    Next <ChevronRight className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </>
          )}
        </QueryState>
      </div>

      <aside className="space-y-4">
        {player.data && (
          <>
            <ProgressSummary progress={player.data.progress} />
            <Card className="max-h-[70vh] overflow-y-auto">
              <CurriculumNav courseId={courseId} curriculum={player.data.curriculum} activeLectureId={lectureId} />
            </Card>
          </>
        )}
      </aside>
    </div>
  );
}
