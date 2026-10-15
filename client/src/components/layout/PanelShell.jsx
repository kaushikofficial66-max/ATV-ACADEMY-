'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Eye, LogOut } from 'lucide-react';
import { NAVIGATION } from '@/config/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import NotificationBell from '@/features/notifications/NotificationBell';
import { useStoreCommerce } from '@/features/commerce/useStoreCommerce';
import Logo from '@/components/layout/Logo';
import { useConfirmLogout } from '@/features/auth/useConfirmLogout';
import BottomNav from '@/components/layout/BottomNav';
import { Avatar } from '@/components/ui';
import { cn, fullName, humanize } from '@/lib/utils';

const isActive = (pathname, href, root) => (href === root ? pathname === root : pathname === href || pathname.startsWith(`${href}/`));

function SidebarNav({ role }) {
  const pathname = usePathname();
  const store = useStoreCommerce();
  const root = `/${role}`;
  return (
    <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
      {NAVIGATION[role].filter((item) => !(store.enabled && item.hideInStoreMode) && !(item.storeModeOnly && !store.enabled)).map((item, i) =>
        item.section ? (
          <p key={`s-${i}`} className="px-3 pb-1.5 pt-6 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {item.section}
          </p>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href, root) ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive(pathname, item.href, root) ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
          >
            {isActive(pathname, item.href, root) && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-brand-600" aria-hidden />}
            <item.icon className={cn('size-[18px] shrink-0', isActive(pathname, item.href, root) ? 'text-brand-700' : 'text-slate-400 group-hover:text-slate-600')} aria-hidden />
            {item.label}
          </Link>
        )
      )}
    </nav>
  );
}

function SidebarFooter({ user, role, onLogout, exitLabel }) {
  return (
    <div className="border-t border-slate-100 p-3">
      <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5">
        <Avatar user={user} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-slate-900">{fullName(user)}</p>
          <p className="truncate text-xs text-slate-500">{humanize(role)}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-slate-700 hover:shadow-sm"
          aria-label={exitLabel}
          title={exitLabel}
        >
          <LogOut className="size-[18px]" />
        </button>
      </div>
    </div>
  );
}

/**
 * Layout for the student, tutor and admin panels.
 *  - desktop (lg+): sidebar + top bar
 *  - phone: compact top bar + Android-style bottom navigation (see BottomNav)
 */
export default function PanelShell({ role, children }) {
  const { user, impersonator, exitViewAs } = useAuth();
  const logout = useConfirmLogout();
  const exitLabel = impersonator ? 'Exit preview' : 'Log out';

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
          <Logo href={`/${role}`} imgClassName="h-9" />
          {role !== 'student' && <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">{role}</span>}
        </div>
        <SidebarNav role={role} />
        <SidebarFooter user={user} role={user?.role_name} onLogout={logout} exitLabel={exitLabel} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {impersonator && (
          <div role="status" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-500 px-4 py-2 text-xs font-medium text-amber-950 sm:text-sm">
            <span className="inline-flex items-center gap-2">
              <Eye className="size-4" aria-hidden />
              Viewing as {fullName(user)} ({humanize(user?.role_name)}) - read-only preview
            </span>
            <button type="button" onClick={exitViewAs} className="rounded-md bg-amber-950 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-900">
              Exit preview
            </button>
          </div>
        )}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:h-16" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="lg:hidden">
            <Logo href={`/${role}`} imgClassName="h-7" />
          </div>
          <div className="flex-1" />
          <NotificationBell href={`/${role}/notifications`} />
          <div className="flex items-center gap-3 lg:border-l lg:border-slate-200 lg:pl-4">
            <Avatar user={user} size={32} />
            <div className="hidden text-sm lg:block">
              <p className="font-medium leading-tight text-slate-900">{fullName(user)}</p>
              <p className="text-xs text-slate-500">{humanize(user?.role_name)}</p>
            </div>
          </div>
        </header>
        <main className="pb-nav flex-1 px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <BottomNav role={role} />
    </div>
  );
}
