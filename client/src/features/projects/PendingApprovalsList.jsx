'use client';

import Link from 'next/link';
import { Avatar, StatusBadge } from '@/components/ui';
import { EmptyState } from '@/components/feedback/States';
import { formatDateTime, fullName } from '@/lib/utils';
import { ClipboardCheck } from 'lucide-react';

/**
 * Final projects waiting for approval (90% rule, phase 2). Used on the tutor
 * and admin dashboards; `role` decides where "Review" links go.
 */
export default function PendingApprovalsList({ items = [], role }) {
  if (!items.length) return <EmptyState icon={ClipboardCheck} title="No projects waiting for approval" />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((s) => (
        <li key={s.id} className="flex items-center gap-3 px-5 py-3">
          <Avatar user={s.student} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{fullName(s.student)}</p>
            <p className="truncate text-xs text-slate-500">
              {s.project?.course?.title} · submitted {formatDateTime(s.submitted_at)}
            </p>
          </div>
          <StatusBadge status={s.status} label="Pending approval" />
          <Link href={`/${role}/submissions?review=${s.id}`} className="text-sm font-medium text-brand-700 hover:underline">
            Review
          </Link>
        </li>
      ))}
    </ul>
  );
}
