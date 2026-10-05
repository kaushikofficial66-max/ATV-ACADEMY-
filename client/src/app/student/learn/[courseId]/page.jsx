'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Award, Download, HelpCircle, PlayCircle } from 'lucide-react';
import { get, downloadFile } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Badge, Button, Card, CardHeader, PageHeader, StatusBadge } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { learningKeys } from '@/features/learning/keys';
import ProgressSummary from '@/features/learning/ProgressSummary';
import CurriculumNav from '@/features/learning/CurriculumNav';
import ProjectSubmitCard from '@/features/projects/ProjectSubmitCard';

export default function CourseLearnPage({ params }) {
  const { courseId } = use(params);
  const query = useQuery({ queryKey: learningKeys.player(courseId), queryFn: () => get(EP.student.player(courseId)).then((r) => r.data) });

  return (
    <QueryState query={query} loading={<Loader />}>
      {(d) => {
        const first = d.curriculum[0]?.lectures[0];
        const resumeId = d.resume_lecture?.id || first?.id;
        return (
          <>
            <PageHeader
              title={d.course.title}
              description={d.is_staff_preview ? 'Staff preview - progress is not tracked' : undefined}
              actions={
                resumeId && (
                  <Button href={`/student/learn/${courseId}/lecture/${resumeId}`}>
                    <PlayCircle className="size-4" aria-hidden /> {d.progress?.completion_percentage > 0 ? 'Continue learning' : 'Start course'}
                  </Button>
                )
              }
            />
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <Card>
                  <CardHeader title="Course content" />
                  <CurriculumNav courseId={courseId} curriculum={d.curriculum} />
                </Card>
                {d.quizzes.length > 0 && (
                  <Card>
                    <CardHeader title="Quizzes" />
                    <ul className="divide-y divide-slate-100">
                      {d.quizzes.map((q) => (
                        <li key={q.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                          <HelpCircle className="size-4 text-slate-400" aria-hidden />
                          <span className="flex-1">{q.title}</span>
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
                      <Award className="size-6 text-brand-700" aria-hidden />
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">Certificate</p>
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
                {d.progress?.status === 'completed' && (
                  <p className="text-center text-sm text-slate-500">
                    Enjoyed the course? <Link href="/student/reviews" className="text-brand-700 hover:underline">Leave a review</Link>
                  </p>
                )}
              </div>
            </div>
          </>
        );
      }}
    </QueryState>
  );
}
