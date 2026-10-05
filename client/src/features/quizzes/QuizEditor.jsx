'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';

const blankQuestion = () => ({ question: '', question_type: 'single', marks: 1, answers: [{ answer_text: '', is_correct: true }, { answer_text: '', is_correct: false }] });
const TRUE_FALSE = [
  { answer_text: 'True', is_correct: true },
  { answer_text: 'False', is_correct: false }
];

/**
 * Quiz settings + questions in one form. Saving sends the full `questions`
 * array (the API replaces questions while the quiz has no attempts).
 */
export default function QuizEditor({ quiz, sections = [], saving, onSave }) {
  const [v, setV] = useState({
    title: quiz?.title || '',
    description: quiz?.description || '',
    section_id: quiz?.section_id || '',
    time_limit_minutes: quiz?.time_limit_minutes || '',
    max_attempts: quiz?.max_attempts || '',
    passing_percentage: quiz && Number(quiz.total_marks) ? Math.round((Number(quiz.passing_marks) / Number(quiz.total_marks)) * 100) : 60,
    status: quiz?.status || 'draft'
  });
  const [questions, setQuestions] = useState(
    quiz?.questions?.length
      ? quiz.questions.map((q) => ({ question: q.question, question_type: q.question_type, marks: Number(q.marks), answers: q.answers.map((a) => ({ answer_text: a.answer_text, is_correct: Boolean(a.is_correct) })) }))
      : [blankQuestion()]
  );

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const updateQ = (i, patch) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const updateA = (qi, ai, patch, single) =>
    setQuestions((qs) =>
      qs.map((q, j) => {
        if (j !== qi) return q;
        return { ...q, answers: q.answers.map((a, k) => (k === ai ? { ...a, ...patch } : single && patch.is_correct ? { ...a, is_correct: false } : a)) };
      })
    );

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...v,
          section_id: v.section_id || null,
          time_limit_minutes: v.time_limit_minutes ? Number(v.time_limit_minutes) : null,
          max_attempts: v.max_attempts ? Number(v.max_attempts) : null,
          passing_percentage: Number(v.passing_percentage),
          questions: questions.map((q) => ({ ...q, marks: Number(q.marks) || 1 }))
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="quiz_title" required className="sm:col-span-2">
          <Input id="quiz_title" value={v.title} onChange={set('title')} required />
        </Field>
        <Field label="Description" htmlFor="quiz_description" className="sm:col-span-2">
          <Textarea id="quiz_description" rows={2} value={v.description} onChange={set('description')} />
        </Field>
        <Field label="Section" htmlFor="quiz_section">
          <Select id="quiz_section" value={v.section_id} onChange={set('section_id')}>
            <option value="">End of course</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="quiz_status">
          <Select id="quiz_status" value={v.status} onChange={set('status')}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Pass mark (%)" htmlFor="quiz_pass">
          <Input id="quiz_pass" type="number" min="0" max="100" value={v.passing_percentage} onChange={set('passing_percentage')} />
        </Field>
        <Field label="Time limit (minutes)" htmlFor="quiz_time" hint="Empty for no limit">
          <Input id="quiz_time" type="number" min="0" value={v.time_limit_minutes} onChange={set('time_limit_minutes')} />
        </Field>
        <Field label="Max attempts" htmlFor="quiz_attempts" hint="Empty for unlimited">
          <Input id="quiz_attempts" type="number" min="0" value={v.max_attempts} onChange={set('max_attempts')} />
        </Field>
      </div>

      <div className="space-y-4">
        {questions.map((q, qi) => (
          <Card key={qi} className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <Field label={`Question ${qi + 1}`} className="flex-1">
                <Textarea rows={2} value={q.question} onChange={(e) => updateQ(qi, { question: e.target.value })} required />
              </Field>
              <button type="button" className="mt-7 rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remove question" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== qi))}>
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={q.question_type}
                aria-label="Question type"
                onChange={(e) => {
                  const type = e.target.value;
                  updateQ(qi, { question_type: type, ...(type === 'true_false' && { answers: TRUE_FALSE.map((a) => ({ ...a })) }) });
                }}
              >
                <option value="single">Single choice</option>
                <option value="multiple">Multiple choice</option>
                <option value="true_false">True / False</option>
              </Select>
              <Input type="number" min="0" step="0.5" value={q.marks} onChange={(e) => updateQ(qi, { marks: e.target.value })} aria-label="Marks" />
            </div>
            <ul className="space-y-2">
              {q.answers.map((a, ai) => (
                <li key={ai} className="flex items-center gap-2">
                  <input
                    type={q.question_type === 'multiple' ? 'checkbox' : 'radio'}
                    name={`correct-${qi}`}
                    checked={a.is_correct}
                    onChange={(e) => updateA(qi, ai, { is_correct: e.target.checked }, q.question_type !== 'multiple')}
                    aria-label="Correct answer"
                    className="accent-green-600"
                  />
                  <Input value={a.answer_text} onChange={(e) => updateA(qi, ai, { answer_text: e.target.value })} disabled={q.question_type === 'true_false'} placeholder={`Option ${ai + 1}`} required />
                  {q.question_type !== 'true_false' && q.answers.length > 2 && (
                    <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remove option" onClick={() => updateQ(qi, { answers: q.answers.filter((_, k) => k !== ai) })}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {q.question_type !== 'true_false' && (
              <Button type="button" size="sm" variant="ghost" onClick={() => updateQ(qi, { answers: [...q.answers, { answer_text: '', is_correct: false }] })}>
                <Plus className="size-4" aria-hidden /> Add option
              </Button>
            )}
          </Card>
        ))}
        <Button type="button" variant="secondary" onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}>
          <Plus className="size-4" aria-hidden /> Add question
        </Button>
      </div>
      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button type="submit" loading={saving}>
          Save quiz
        </Button>
      </div>
    </form>
  );
}
