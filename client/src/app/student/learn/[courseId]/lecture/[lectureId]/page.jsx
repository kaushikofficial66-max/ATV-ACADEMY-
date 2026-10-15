'use client';

import { use, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { ArrowRight, ChevronLeft, ChevronRight, CircleCheck } from 'lucide-react';
import { get, post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, ProgressRing } from '@/components/ui';
import { ErrorState } from '@/components/feedback/States';
import { FullPageLoader, Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { learningKeys } from '@/features/learning/keys';
import PlayerLayout from '@/features/learning/PlayerLayout';
import LectureTabs from '@/features/learning/LectureTabs';
import { progressHint } from '@/features/learning/ProgressSummary';
import VideoPlayer from '@/features/videos/VideoPlayer';
import LiveBadge from '@/features/learning/LiveBadge';
import LiveLecturePanel from '@/features/learning/LiveLecturePanel';

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

  if (player.isPending) return <FullPageLoader />;
  if (player.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <ErrorState error={player.error} onRetry={player.refetch} title="Could not open this course" />
      </div>
    );
  }
  const course = player.data;

  return (
    <PlayerLayout courseId={courseId} courseTitle={course.course.title} curriculum={course.curriculum} activeLectureId={lectureId}>
      {/* Course progress strip */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Course progress</p>
          <p className="mt-0.5 line-clamp-1 max-w-2xl text-xs text-slate-500 sm:line-clamp-2">{course.progress ? progressHint(course.progress) : 'Staff preview - progress is not tracked.'}</p>
          <Link href={`/student/learn/${courseId}`} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
            View details <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        {course.progress && <ProgressRing value={course.progress.completion_percentage} size={56} />}
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-5">
        {lecture.isPending && <Loader />}
        {lecture.isError && <ErrorState error={lecture.error} onRetry={lecture.refetch} title="Could not load this lecture" />}
        {lecture.data && (
          <>
            <p className="mb-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">Lecture:</span> {lecture.data.lecture.title}
              {lecture.data.lecture.lecture_type === 'live_class' && <LiveBadge status={lecture.data.lecture.live_class?.status} className="ml-2 align-middle" />}
            </p>

            {lecture.data.video ? (
              <div className="-mx-4 overflow-hidden bg-black sm:mx-0 sm:rounded-xl sm:shadow-lg sm:shadow-slate-900/10">
                <VideoPlayer
                  key={lecture.data.video.id}
                  playback={lecture.data.video.playback}
                  title={lecture.data.video.title}
                  startAt={lecture.data.video.progress.last_position_seconds}
                  onPlay={onPlay}
                  onTimeUpdate={onTimeUpdate}
                  onEnded={() => lecture.data.is_enrolled && saveProgress(true)}
                />
              </div>
            ) : lecture.data.lecture.lecture_type === 'live_class' ? (
              <LiveLecturePanel liveClass={lecture.data.lecture.live_class} />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                This lecture has no video. See the overview below.
              </div>
            )}

            {/* Previous / complete / next */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {lecture.data.navigation.previous ? (
                <Button href={`/student/learn/${courseId}/lecture/${lecture.data.navigation.previous.id}`} variant="secondary" size="sm">
                  <ChevronLeft className="size-4" aria-hidden /> Previous
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap items-center gap-3">
                {lecture.data.is_enrolled &&
                  (lecture.data.progress.completed ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                      <CircleCheck className="size-4" aria-hidden /> Completed
                    </span>
                  ) : (
                    <Button variant="secondary" size="sm" loading={complete.isPending} onClick={() => complete.mutate()}>
                      <CircleCheck className="size-4" aria-hidden /> Mark as complete
                    </Button>
                  ))}
                {lecture.data.navigation.next && (
                  <Button href={`/student/learn/${courseId}/lecture/${lecture.data.navigation.next.id}`} size="sm">
                    Next lecture <ChevronRight className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </div>

            <LectureTabs courseId={courseId} lectureId={lectureId} lecture={lecture.data} canRate={Boolean(lecture.data.is_enrolled)} />
          </>
        )}
      </div>
    </PlayerLayout>
  );
}
