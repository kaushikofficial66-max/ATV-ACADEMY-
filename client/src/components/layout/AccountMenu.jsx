'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, LogOut } from 'lucide-react';
import { ACCOUNT_MENU } from '@/config/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import { useConfirmLogout } from '@/features/auth/useConfirmLogout';
import { Avatar } from '@/components/ui';
import { cn, fullName, humanize } from '@/lib/utils';

/**
 * Profile button at the top right of the panel header. Opens a small modal-style list: the account pages for the
 * role (student: purchases, notifications, profile; tutor: notifications, account; admin: account only) and Log out.
 * Choosing an item opens that page and closes the list; Escape or a click outside closes it too.
 */
export default function AccountMenu({ role }) {
  const pathname = usePathname();
  const { user, impersonator } = useAuth();
  const logout = useConfirmLogout();
  // open only for the page it was opened on, so moving to another page closes it without an effect
  const [openPath, setOpenPath] = useState(null);
  const open = openPath === pathname;
  const box = useRef(null);
  const items = ACCOUNT_MENU[role] || [];

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpenPath(null);
    const onDown = (e) => box.current && !box.current.contains(e.target) && setOpenPath(null);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  return (
    <div ref={box} className="relative lg:border-l lg:border-slate-200 lg:pl-4">
      <button
        type="button"
        onClick={() => setOpenPath(open ? null : pathname)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2.5 rounded-xl p-1 pr-2 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <Avatar user={user} size={32} />
        <span className="hidden text-left text-sm lg:block">
          <span className="block font-medium leading-tight text-slate-900">{fullName(user)}</span>
          <span className="block text-xs text-slate-500">{humanize(user?.role_name)}</span>
        </span>
        <ChevronDown className={cn('hidden size-4 text-slate-400 transition-transform lg:block', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div role="dialog" aria-label="Account" className="fade-in absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
            <Avatar user={user} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{fullName(user)}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <ul className="p-1.5">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpenPath(null)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    pathname === item.href || pathname.startsWith(`${item.href}/`) ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <item.icon className="size-[18px] text-slate-400" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => {
                setOpenPath(null);
                logout();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="size-[18px]" aria-hidden />
              {impersonator ? 'Exit preview' : 'Log out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
