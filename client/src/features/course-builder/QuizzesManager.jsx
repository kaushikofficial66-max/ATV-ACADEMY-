'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { get, post, put, del } from '@/lib/api/client';
import { manage } from '@/lib/api/endpoints';
import { Button, Card, DataTable, StatusBadge } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import QuizEditor from '@/features/quizzes/QuizEditor';
import { builderKeys } from './keys';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

export default function QuizzesManager({ role, courseId }) {
  const m = manage(role);
  const key = builderKeys.quizzes(role, courseId);
  const ask = useConfirm();
  const [editing, setEditing] = useState(null); // {} new | { id }
  const quizzes = useQuery({ queryKey: key, queryFn: () => get(m.quizzes(courseId)).then((r) => r.data.quizzes) });
  const curriculum = useQuery({ queryKey: builderKeys.curriculum(role, courseId), queryFn: () => get(m.curriculum(courseId)).then((r) => r.data.sections) });
  const full = useQuery({
    queryKey: [...key, 'detail', editing?.id],
    queryFn: () => get(m.quiz(editing.id)).then((r) => r.data.quiz),
    enabled: Boolean(editing?.id)
  });
  const invalidate = [key, builderKeys.course(role, courseId)];
  const save = useApiMutation((body) => (editing?.id ? put(m.quiz(editing.id), body) : post(m.quizzes(courseId), body)), {
    invalidate,
    onSuccess: () => setEditing(null)
  });
  const remove = useApiMutation((id) => del(m.quiz(id)), { invalidate });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing({})}>
          <Plus className="size-4" aria-hidden /> New quiz
        </Button>
      </div>
      <Card>
        <QueryState query={quizzes} loading={<Loader />}>
          {(rows) => (
            <DataTable
              rows={rows}
              empty="No quizzes yet."
              onRowClick={(q) => setEditing({ id: q.id })}
              columns={[
                { key: 'title', header: 'Quiz', render: (q) => <span className="font-medium text-slate-900">{q.title}</span> },
                { key: 'question_count', header: 'Questions', render: (q) => q.question_count ?? q.questions?.length ?? '-' },
                { key: 'passing', header: 'Pass mark', render: (q) => `${q.passing_marks} / ${q.total_marks}` },
                { key: 'status', header: 'Status', render: (q) => <StatusBadge status={q.status} /> },
                {
                  key: 'actions',
                  header: '',
                  render: (q) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Delete quiz"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (await ask({ title: 'Delete quiz?', message: `"${q.title}" will be deleted.`, confirmLabel: 'Delete' })) remove.mutate(q.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )
                }
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit quiz' : 'New quiz'} size="xl">
        {editing &&
          (editing.id && !full.data ? (
            <Loader />
          ) : (
            <QuizEditor key={editing.id || 'new'} quiz={editing.id ? full.data : null} sections={curriculum.data || []} saving={save.isPending} onSave={(body) => save.mutate(body)} />
          ))}
      </Modal>
    </>
  );
}
