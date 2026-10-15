'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Award, ChevronLeft, Download, HelpCircle, PlayCircle } from 'lucide-react';
import { get, downloadFile } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Badge, Button, Card, CardHeader, ProgressRing, StatusBadge } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { learningKeys } from '@/features/learning/keys';
import ProgressSummary from '@/features/learning/ProgressSummary';
import ModuleList from '@/features/learning/ModuleList';
import ProjectSubmitCard from '@/features/projects/ProjectSubmitCard';

export default function CourseLearnPage({ params }) {
  const { courseId } = use(params);
  const query = useQuery({ queryKey: learningKeys.player(courseId), queryFn: () => get(EP.student.player(courseId)).then((r) => r.data) });

  return (
    <QueryState query={query} loading={<Loader />}>
      {(d) => {
        const first = d.curriculum[0]?.lectures[0];
        const resumeId = d.resume_lecture?.id || first?.id;
        const pct = Number(d.progress?.completion_percentage || 0);
        return (
          <div className="space-y-4 sm:space-y-6">
            <Link href="/student/courses" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
              <ChevronLeft className="size-4" aria-hidden /> My courses
            </Link>

            {/* Course header */}
            <section className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-slate-950/50 p-5 text-white shadow-xl shadow-black/10 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:rounded-3xl sm:p-8">
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight tracking-tight sm:text-3xl">
                  {d.course.title}
                </h1>

                <p className="mt-2 text-sm text-white/70">
                  {d.is_staff_preview
                    ? 'Staff preview - progress is not tracked'
                    : d.progress?.total_lectures
                      ? `${d.progress.completed_lectures} of ${d.progress.total_lectures} lectures completed`
                      : 'Welcome to your course'}
                </p>

                {resumeId && (
                  <Link
                    href={`/student/learn/${courseId}/lecture/${resumeId}`}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/95 px-6 text-sm font-semibold text-slate-900 shadow-lg transition-all duration-300 hover:bg-white hover:shadow-white/10 sm:mt-5 sm:h-12 sm:w-auto"
                  >
                    <PlayCircle className="size-5" aria-hidden />
                    {pct > 0 ? 'Continue learning' : 'Start course'}
                  </Link>
                )}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <Card className="overflow-hidden">
                  <CardHeader title="Course content" description={`${d.curriculum.length} module${d.curriculum.length === 1 ? '' : 's'}`} />
                  <ModuleList courseId={courseId} curriculum={d.curriculum} />
                </Card>
                {d.quizzes.length > 0 && (
                  <Card>
                    <CardHeader title="Quizzes" />
                    <ul className="divide-y divide-slate-100">
                      {d.quizzes.map((q) => (
                        <li key={q.id} className="flex items-center gap-3 px-5 py-3.5 text-sm">
                          <HelpCircle className="size-4 text-slate-400" aria-hidden />
                          <span className="flex-1 font-medium text-slate-800">{q.title}</span>
                          {q.passed ? <Badge tone="green">Passed</Badge> : q.best_percentage !== null ? <Badge tone="amber">Best {q.best_percentage}%</Badge> : null}
                          <Button href={`/student/quizzes/${q.id}`} size="sm" variant="secondary">
                            {q.attempts_used ? 'Retake' : 'Start'}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
              <div className="space-y-6">
                <ProgressSummary progress={d.progress} />
                <ProjectSubmitCard courseId={courseId} summary={d.project} />
                {d.certificate && (
                  <Card className="p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                        <Award className="size-6" aria-hidden />
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">Certificate</p>
                        <StatusBadge status={d.certificate.status} />
                      </div>
                      {['approved', 'issued'].includes(d.certificate.status) && (
                        <Button size="sm" variant="secondary" onClick={() => downloadFile(EP.student.certificateDownload(d.certificate.id), 'certificate.pdf')}>
                          <Download className="size-4" aria-hidden /> PDF
                        </Button>
                      )}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
