'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX } from 'lucide-react';
import { get, post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Badge, Button, Card, CardHeader, DataTable, PageHeader } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { learningKeys } from '@/features/learning/keys';
import QuizRunner from '@/features/quizzes/QuizRunner';
import { formatDateTime } from '@/lib/utils';

export default function QuizPage({ params }) {
  const { quizId } = use(params);
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const query = useQuery({ queryKey: learningKeys.quiz(quizId), queryFn: () => get(EP.student.quiz(quizId)).then((r) => r.data) });

  const start = useApiMutation(() => post(EP.student.quizStart(quizId)), {
    silent: true,
    onSuccess: (res) => {
      setResult(null);
      setSession(res.data);
    }
  });

  const finished = (data) => {
    setSession(null);
    setResult(data);
    queryClient.invalidateQueries({ queryKey: learningKeys.quiz(quizId) });
    queryClient.invalidateQueries({ queryKey: learningKeys.all });
  };

  return (
    <QueryState query={query} loading={<Loader />}>
      {(d) => (
        <>
          <PageHeader title={d.quiz.title} description={d.quiz.course?.title} />
          {session ? (
            <QuizRunner attempt={session.attempt} questions={session.questions} remainingSeconds={session.remaining_seconds} onFinished={finished} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {result && (
                  <Card className="p-6 text-center">
                    {result.passed ? <CircleCheck className="mx-auto size-12 text-green-600" aria-hidden /> : <CircleX className="mx-auto size-12 text-red-500" aria-hidden />}
                    <p className="mt-3 text-2xl font-semibold text-slate-900">{result.percentage}%</p>
                    <p className="text-sm text-slate-600">
                      {result.score} / {result.total_marks} marks · {result.passed ? 'Passed' : result.late_submission ? 'Submitted after the time limit' : 'Not passed'}
                    </p>
                  </Card>
                )}
                <Card>
                  <CardHeader title="Your attempts" />
                  <DataTable
                    rows={d.attempts}
                    empty="No attempts yet."
                    columns={[
                      { key: 'attempt_number', header: '#' },
                      { key: 'percentage', header: 'Score', render: (a) => (a.status === 'started' ? 'In progress' : `${a.percentage}%`) },
                      { key: 'passed', header: 'Result', render: (a) => (a.status === 'started' ? '-' : a.passed ? <Badge tone="green">Passed</Badge> : <Badge tone="red">Failed</Badge>) },
                      { key: 'submitted_at', header: 'Submitted', render: (a) => (a.submitted_at ? formatDateTime(a.submitted_at) : '-') }
                    ]}
                  />
                </Card>
              </div>
              <Card className="h-fit space-y-3 p-5 text-sm">
                {d.quiz.description && <p className="text-slate-600">{d.quiz.description}</p>}
                <Row label="Questions" value={d.quiz.question_count} />
                <Row label="Pass mark" value={`${d.quiz.passing_marks} / ${d.quiz.total_marks} (${d.quiz.passing_percentage}%)`} />
                <Row label="Time limit" value={d.quiz.time_limit_minutes ? `${d.quiz.time_limit_minutes} min` : 'None'} />
                <Row label="Attempts left" value={d.attempts_remaining ?? 'Unlimited'} />
                <Row label="Best score" value={d.best_percentage !== null ? `${d.best_percentage}%` : '-'} />
                <Button className="w-full" loading={start.isPending} disabled={!d.can_attempt} onClick={() => start.mutate()}>
                  {d.in_progress_attempt_id ? 'Resume attempt' : d.attempts_used ? 'Retake quiz' : 'Start quiz'}
                </Button>
                {!d.can_attempt && <p className="text-center text-xs text-slate-500">You have used all attempts for this quiz.</p>}
              </Card>
            </div>
          )}
        </>
      )}
    </QueryState>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
