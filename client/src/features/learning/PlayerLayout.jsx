'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ListVideo, LogOut, X } from 'lucide-react';
import Logo from '@/components/layout/Logo';
import NotificationBell from '@/features/notifications/NotificationBell';
import { useAuth } from '@/features/auth/AuthProvider';
import { Avatar } from '@/components/ui';
import { fullName } from '@/lib/utils';
import ModuleList from './ModuleList';
import { useConfirmLogout } from '@/features/auth/useConfirmLogout';

/**
 * Full-screen course player layout: logo + module list on the left (drawer on phones), a slim top
 * bar with the back arrow and course title, and the lecture on the right.
 */
export default function PlayerLayout({ courseId, courseTitle, curriculum, activeLectureId, children }) {
  const { user } = useAuth();
  const logout = useConfirmLogout();
  const [open, setOpen] = useState(false);

  const list = (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <ModuleList courseId={courseId} curriculum={curriculum} activeLectureId={activeLectureId} onNavigate={() => setOpen(false)} />
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop: modules */}
      <aside className="hidden w-[340px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-slate-200 px-6">
          <Logo href="/student/courses" imgClassName="h-9" />
        </div>
        {list}
      </aside>

      {/* Phone: course contents as a bottom sheet */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Course content">
          <div className="fade-in absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="sheet-up absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-3xl bg-white shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="shrink-0 px-5 pb-2 pt-3">
              <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-slate-300" aria-hidden />
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-slate-900">Course content</span>
                <button className="rounded-full p-1.5 text-slate-500 active:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close course content">
                  <X className="size-5" />
                </button>
              </div>
            </div>
            {list}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:h-16 sm:gap-3 sm:px-6" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <Link href="/student/courses" aria-label="Back to my courses" className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100">
            <ChevronLeft className="size-6" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900 sm:text-lg">{courseTitle || 'Course'}</h1>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100 lg:hidden"
          >
            <ListVideo className="size-4" aria-hidden /> Contents
          </button>
          <NotificationBell href="/student/notifications" />
          <div className="hidden items-center gap-2 border-l border-slate-200 pl-4 sm:flex">
            <Avatar user={user} size={32} />
            <span className="text-sm font-medium text-slate-700">{fullName(user)}</span>
            <button type="button" onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Log out" title="Log out">
              <LogOut className="size-[18px]" />
            </button>
          </div>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
