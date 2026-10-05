'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { put } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Field, Textarea } from '@/components/ui';
import { useApiMutation } from '@/hooks/useApiMutation';
import { cn } from '@/lib/utils';

/** Create or update the student's review of a course (PUT is an upsert). */
export default function ReviewForm({ courseId, initial, onDone }) {
  const [rating, setRating] = useState(initial?.rating || 0);
  const [text, setText] = useState(initial?.review || '');
  const save = useApiMutation(() => put(EP.student.courseReview(courseId), { rating, review: text || null }), {
    invalidate: [['student', 'reviews']],
    onSuccess: onDone
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (rating) save.mutate();
      }}
    >
      <Field label="Rating" required>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)}>
              <Star className={cn('size-7', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Your review" htmlFor="review_text">
        <Textarea id="review_text" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
      </Field>
      <Button type="submit" loading={save.isPending} disabled={!rating || !courseId}>
        Save review
      </Button>
    </form>
  );
}
