'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, MoreHorizontal } from 'lucide-react';
import { MOBILE_TABS, NAVIGATION } from '@/config/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import { useStoreCommerce } from '@/features/commerce/useStoreCommerce';
import { Avatar } from '@/components/ui';
import { cn, fullName, humanize } from '@/lib/utils';

const isActive = (pathname, href, root) => (href === root ? pathname === root : pathname === href || pathname.startsWith(`${href}/`));

/**
 * Phone-only (below lg) bottom navigation, like an Android app: four main tabs with a pill-shaped
 * indicator, plus "More" which slides up a sheet with every other page and the logout button.
 */
export default function BottomNav({ role }) {
  const pathname = usePathname();
  const { user, logout, impersonator } = useAuth();
  const store = useStoreCommerce();
  // The sheet is "open" only for the page it was opened on, so navigating closes it without an effect.
  const [openPath, setOpenPath] = useState(null);
  const open = openPath === pathname;
  const setOpen = (value) => setOpenPath(value ? pathname : null);
  const root = `/${role}`;
  const tabs = MOBILE_TABS[role] || [];
  const tabHrefs = new Set(tabs.map((t) => t.href));
  const moreActive = !tabs.some((t) => isActive(pathname, t.href, root));

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpenPath(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const extra = NAVIGATION[role].filter((i) => (i.section ? true : !tabHrefs.has(i.href) && !(store.enabled && i.hideInStoreMode)));

  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="grid grid-cols-5">
          {tabs.map((t) => {
            const active = isActive(pathname, t.href, root);
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? 'page' : undefined} className="flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium">
                  <span className={cn('flex h-7 w-14 items-center justify-center rounded-full transition-colors', active ? 'bg-brand-100 text-brand-800' : 'text-slate-500')}>
                    <t.icon className="size-[22px]" aria-hidden />
                  </span>
                  <span className={active ? 'text-brand-800' : 'text-slate-500'}>{t.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="flex w-full flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium">
              <span className={cn('flex h-7 w-14 items-center justify-center rounded-full transition-colors', moreActive ? 'bg-brand-100 text-brand-800' : 'text-slate-500')}>
                <MoreHorizontal className="size-[22px]" aria-hidden />
              </span>
              <span className={moreActive ? 'text-brand-800' : 'text-slate-500'}>More</span>
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <div className="fade-in absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="sheet-up absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="sticky top-0 z-10 bg-white px-5 pb-3 pt-3">
              <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-slate-300" aria-hidden />
              <div className="flex items-center gap-3">
                <Avatar user={user} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-slate-900">{fullName(user)}</p>
                  <p className="truncate text-xs text-slate-500">{user?.email}</p>
                </div>
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">{humanize(user?.role_name)}</span>
              </div>
            </div>
            <ul className="px-3">
              {extra.map((item, i) =>
                item.section ? (
                  <li key={`s-${i}`} className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {item.section}
                  </li>
                ) : (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-4 rounded-xl px-3 py-3 text-[15px] font-medium',
                        isActive(pathname, item.href, root) ? 'bg-brand-50 text-brand-800' : 'text-slate-700 active:bg-slate-100'
                      )}
                    >
                      <item.icon className="size-5 text-slate-400" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
            <div className="mt-2 border-t border-slate-100 px-3 pt-2">
              <button type="button" onClick={logout} className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-[15px] font-medium text-red-600 active:bg-red-50">
                <LogOut className="size-5" aria-hidden /> {impersonator ? 'Exit preview' : 'Log out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
