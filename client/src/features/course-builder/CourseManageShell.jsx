'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { get } from '@/lib/api/client';
import { manage } from '@/lib/api/endpoints';
import { StatusBadge } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { builderKeys } from './keys';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '', label: 'Details' },
  { href: '/curriculum', label: 'Curriculum' },
  { href: '/videos', label: 'Videos' },
  { href: '/resources', label: 'Resources' },
  { href: '/quizzes', label: 'Quizzes' },
  { href: '/project', label: 'Final project' }
];

/** Course title + tab navigation around every course-management page. */
export function useManagedCourse(role, courseId) {
  return useQuery({ queryKey: builderKeys.course(role, courseId), queryFn: () => get(manage(role).course(courseId)).then((r) => r.data) });
}

export default function CourseManageShell({ role, courseId, children }) {
  const pathname = usePathname();
  const base = `/${role}/courses/${courseId}`;
  const query = useManagedCourse(role, courseId);

  return (
    <QueryState query={query} loading={<Loader />}>
      {({ course }) => (
        <>
          <Link href={`/${role}/courses`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" aria-hidden /> All courses
          </Link>
          <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{course.title}</h1>
            <StatusBadge status={course.status} />
          </div>
          <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Course sections">
            {TABS.map((t) => {
              const href = base + t.href;
              const active = pathname === href;
              return (
                <Link
                  key={t.label}
                  href={href}
                  className={cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', active ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800')}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
          {children}
        </>
      )}
    </QueryState>
  );
}
