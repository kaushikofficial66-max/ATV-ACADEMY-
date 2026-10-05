'use client';

import { Star } from 'lucide-react';
import { EP } from '@/lib/api/endpoints';
import { PageHeader, ProgressBar } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { formatDate, fullName } from '@/lib/utils';

export default function TutorReviewsPage() {
  return (
    <>
      <PageHeader title="Reviews" description="What students say about your courses" />
      <ResourceList
        queryKey={['tutor', 'reviews']}
        endpoint={EP.tutor.reviews}
        dataKey="reviews"
        search={false}
        filters={[{ name: 'rating', label: 'Rating', options: [5, 4, 3, 2, 1].map((r) => ({ value: r, label: `${r} stars` })) }]}
        empty="No reviews yet."
        renderAbove={(data) =>
          data?.summary && (
            <div className="flex flex-col gap-6 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
              <div className="text-center">
                <p className="text-4xl font-semibold text-slate-900">{data.summary.average_rating || '-'}</p>
                <p className="text-sm text-slate-500">{data.summary.total_reviews} reviews</p>
              </div>
              <ul className="flex-1 space-y-1">
                {data.summary.breakdown.map((b) => (
                  <li key={b.rating} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="w-6">{b.rating}★</span>
                    <ProgressBar value={data.summary.total_reviews ? (b.count / data.summary.total_reviews) * 100 : 0} className="max-w-xs" />
                    <span>{b.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        }
        columns={[
          { key: 'user', header: 'Student', render: (r) => fullName(r.user) },
          { key: 'course', header: 'Course', render: (r) => r.course?.title },
          {
            key: 'rating',
            header: 'Rating',
            render: (r) => (
              <span className="inline-flex items-center gap-1">
                <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden /> {r.rating}
              </span>
            )
          },
          { key: 'review', header: 'Review', render: (r) => <span className="line-clamp-2 max-w-md">{r.review || '-'}</span> },
          { key: 'created_at', header: 'Date', render: (r) => formatDate(r.created_at) }
        ]}
      />
    </>
  );
}
