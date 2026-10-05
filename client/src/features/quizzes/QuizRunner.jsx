'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { useApiMutation } from '@/hooks/useApiMutation';

/**
 * Answers an attempt started with POST /student/quizzes/:id/start.
 * single / true_false -> { question_id, answer_id }
 * multiple            -> { question_id, answer_ids: [] }
 */
export default function QuizRunner({ attempt, questions, remainingSeconds, onFinished }) {
  const [answers, setAnswers] = useState({});
  const [left, setLeft] = useState(remainingSeconds);

  const submit = useApiMutation(
    () =>
      post(EP.student.attemptSubmit(attempt.id), {
        answers: questions.map((q) =>
          q.question_type === 'multiple' ? { question_id: q.id, answer_ids: answers[q.id] || [] } : { question_id: q.id, answer_id: answers[q.id] ?? null }
        )
      }),
    { success: 'Quiz submitted', onSuccess: (res) => onFinished(res.data) }
  );

  useEffect(() => {
    if (left === null || left === undefined) return undefined;
    if (left <= 0) {
      if (!submit.isPending && !submit.isSuccess) submit.mutate();
      return undefined;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const choose = (q, answerId) =>
    setAnswers((prev) => {
      if (q.question_type !== 'multiple') return { ...prev, [q.id]: answerId };
      const current = prev[q.id] || [];
      return { ...prev, [q.id]: current.includes(answerId) ? current.filter((id) => id !== answerId) : [...current, answerId] };
    });

  const answered = questions.filter((q) => (q.question_type === 'multiple' ? answers[q.id]?.length : answers[q.id] !== undefined)).length;

  return (
    <div className="space-y-4">
      <Card className="sticky top-16 z-10 flex items-center justify-between p-4 text-sm">
        <span>
          {answered} / {questions.length} answered
        </span>
        {left !== null && left !== undefined && (
          <span className={`inline-flex items-center gap-1 font-medium ${left < 60 ? 'text-red-600' : 'text-slate-700'}`}>
            <Clock className="size-4" aria-hidden />
            {Math.floor(Math.max(0, left) / 60)}:{String(Math.max(0, left) % 60).padStart(2, '0')}
          </span>
        )}
      </Card>
      {questions.map((q, i) => (
        <Card key={q.id} className="p-5">
          <p className="font-medium text-slate-900">
            {i + 1}. {q.question}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {Number(q.marks)} marks{q.question_type === 'multiple' ? ' · select all that apply' : ''}
          </p>
          <div className="mt-3 space-y-2">
            {q.answers.map((a) => {
              const checked = q.question_type === 'multiple' ? (answers[q.id] || []).includes(a.id) : answers[q.id] === a.id;
              return (
                <label
                  key={a.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                    checked ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
                  )}
                >
                  <input
                    type={q.question_type === 'multiple' ? 'checkbox' : 'radio'}
                    name={`q-${q.id}`}
                    checked={checked}
                    onChange={() => choose(q, a.id)}
                    className="accent-brand-700"
                  />
                  {a.answer_text}
                </label>
              );
            })}
          </div>
        </Card>
      ))}
      <div className="flex justify-end">
        <Button loading={submit.isPending} onClick={() => submit.mutate()}>
          Submit quiz
        </Button>
      </div>
    </div>
  );
}
