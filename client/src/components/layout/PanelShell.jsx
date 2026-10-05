'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Eye, LogOut, Menu, X } from 'lucide-react';
import { NAVIGATION } from '@/config/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import NotificationBell from '@/features/notifications/NotificationBell';
import { Avatar } from '@/components/ui';
import { cn, fullName, humanize } from '@/lib/utils';
import { SITE_NAME } from '@/lib/config';

const isActive = (pathname, href, root) => (href === root ? pathname === root : pathname === href || pathname.startsWith(`${href}/`));

function SidebarNav({ role, onNavigate }) {
  const pathname = usePathname();
  const root = `/${role}`;
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {NAVIGATION[role].map((item, i) =>
        item.section ? (
          <p key={`s-${i}`} className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {item.section}
          </p>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive(pathname, item.href, root) ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        )
      )}
    </nav>
  );
}

/** Sidebar + top bar layout used by the student, tutor and admin panels. */
export default function PanelShell({ role, children }) {
  const { user, logout, impersonator, exitViewAs } = useAuth();
  const [open, setOpen] = useState(false);

  const brand = (
    <Link href="/" className="flex h-16 items-center gap-2 border-b border-slate-100 px-6 text-lg font-bold text-brand-800">
      {SITE_NAME}
      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-700">{role}</span>
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        {brand}
        <SidebarNav role={role} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
            <button className="absolute right-3 top-4 rounded p-1 text-slate-500" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {brand}
            <SidebarNav role={role} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {impersonator && (
          <div role="status" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
            <span className="inline-flex items-center gap-2">
              <Eye className="size-4" aria-hidden />
              Viewing as {fullName(user)} ({humanize(user?.role_name)}) - read-only preview
            </span>
            <button type="button" onClick={exitViewAs} className="rounded-md bg-amber-950 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-900">
              Exit preview
            </button>
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <NotificationBell href={`/${role}/notifications`} />
          <div className="flex items-center gap-3">
            <Avatar user={user} size={34} />
            <div className="hidden text-sm sm:block">
              <p className="font-medium leading-tight text-slate-900">{fullName(user)}</p>
              <p className="text-xs text-slate-500">{humanize(user?.role_name)}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label={impersonator ? 'Exit preview' : 'Log out'}
            title={impersonator ? 'Exit preview' : 'Log out'}
          >
            <LogOut className="size-5" />
          </button>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
