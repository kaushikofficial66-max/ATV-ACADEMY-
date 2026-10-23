'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Eye, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAVIGATION } from '@/config/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import NotificationBell from '@/features/notifications/NotificationBell';
import { useStoreCommerce } from '@/features/commerce/useStoreCommerce';
import Logo from '@/components/layout/Logo';
import AccountMenu from '@/components/layout/AccountMenu';
import BottomNav from '@/components/layout/BottomNav';
import { cn, fullName, humanize } from '@/lib/utils';

const isActive = (pathname, href, root) => (href === root ? pathname === root : pathname === href || pathname.startsWith(`${href}/`));
const COLLAPSE_KEY = 'atv-sidebar-collapsed';

// Smooth collapse: one easing curve and a slow, gentle 650 ms duration for everything that moves, icons never change position (the sidebar is
// 76px wide when collapsed and the icon sits 29px from the edge in both states), and labels fade + slide instead of
// popping in and out.
const EASE = 'duration-[650ms] ease-[cubic-bezier(0.45,0,0.2,1)] motion-reduce:transition-none';

// The collapsed flag lives in localStorage (per browser); useSyncExternalStore keeps the server markup (open) and the
// browser in step and works even where storage is blocked (then it is only remembered until the page is reloaded).
const listeners = new Set();
let memory = null;
const subscribe = (cb) => {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
};
const readCollapsed = () => {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};
const writeCollapsed = (value) => {
  memory = value;
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    /* storage blocked */
  }
  listeners.forEach((cb) => cb());
};

/** A label that fades and slides away when the sidebar collapses (kept in the page so it can animate). */
function Label({ collapsed, children }) {
  return (
    <span aria-hidden={collapsed} className={cn('ml-3 overflow-hidden whitespace-nowrap transition-[opacity,max-width,transform]', EASE, collapsed ? 'max-w-0 -translate-x-1 opacity-0' : 'max-w-[170px] translate-x-0 opacity-100')}>
      {children}
    </span>
  );
}

function SidebarNav({ role, collapsed }) {
  const pathname = usePathname();
  const store = useStoreCommerce();
  const root = `/${role}`;
  return (
    <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-3 py-4" aria-label="Main">
      {NAVIGATION[role].filter((item) => !(store.enabled && item.hideInStoreMode) && !(item.storeModeOnly && !store.enabled)).map((item, i) => {
        if (item.section) {
          return (
            <div key={`s-${i}`} aria-hidden={collapsed || undefined}>
              {/* heading while open ... */}
              <p
                className={cn(
                  'overflow-hidden whitespace-nowrap px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition-[max-height,opacity,padding]',
                  EASE,
                  collapsed ? 'max-h-0 pb-0 pt-0 opacity-0' : 'max-h-12 pb-1.5 pt-6 opacity-100'
                )}
              >
                {item.section}
              </p>
              {/* ... a thin divider while collapsed */}
              <div className={cn('mx-3 bg-slate-100 transition-[height,margin,opacity]', EASE, collapsed ? 'my-3 h-px opacity-100' : 'my-0 h-0 opacity-0')} />
            </div>
          );
        }
        const active = isActive(pathname, item.href, root);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              'group relative flex items-center rounded-lg py-2.5 pl-[17px] pr-3 text-sm font-medium transition-colors',
              active ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
          >
            {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-brand-600" aria-hidden />}
            <item.icon className={cn('size-[18px] shrink-0', active ? 'text-brand-700' : 'text-slate-400 group-hover:text-slate-600')} aria-hidden />
            <Label collapsed={collapsed}>{item.label}</Label>
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom of the sidebar: the collapse / expand control (the profile card moved to the header menu). */
function CollapseToggle({ collapsed, onToggle }) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <div className="border-t border-slate-100 p-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand' : 'Collapse'}
        className="flex w-full items-center rounded-lg py-2.5 pl-[17px] pr-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <Icon className="size-[18px] shrink-0" aria-hidden />
        <Label collapsed={collapsed}>Collapse</Label>
      </button>
    </div>
  );
}

/**
 * Layout for the student, tutor and admin panels.
 *  - desktop (lg+): collapsible sidebar + top bar with the profile menu
 *  - phone: compact top bar + Android-style bottom navigation (see BottomNav)
 */
export default function PanelShell({ role, children }) {
  const { user, impersonator, exitViewAs } = useAuth();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const toggle = () => writeCollapsed(!collapsed);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] lg:flex', EASE, collapsed ? 'w-[76px]' : 'w-64')}>
        <div className="relative h-16 shrink-0 border-b border-slate-100">
          {/* full logo (open) and the small "AV" mark (collapsed) cross-fade in the same spot */}
          <div className={cn('absolute inset-y-0 left-5 right-5 flex items-center justify-between transition-opacity', EASE, collapsed ? 'pointer-events-none opacity-0' : 'opacity-100')} aria-hidden={collapsed}>
            <Logo href={`/${role}`} imgClassName="h-9" />
            {role !== 'student' && <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">{role}</span>}
          </div>
          <Link
            href={`/${role}`}
            aria-label="Home"
            tabIndex={collapsed ? 0 : -1}
            className={cn('absolute left-5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white transition-opacity', EASE, collapsed ? 'opacity-100' : 'pointer-events-none opacity-0')}
          >
            AT V
          </Link>
        </div>
        <SidebarNav role={role} collapsed={collapsed} />
        <CollapseToggle collapsed={collapsed} onToggle={toggle} />
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
          <AccountMenu role={role} />
        </header>
        <main className="pb-nav flex-1 px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <BottomNav role={role} />
    </div>
  );
}
