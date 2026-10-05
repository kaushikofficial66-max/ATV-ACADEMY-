'use client';

import Link from 'next/link';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui';
import { SITE_NAME } from '@/lib/config';

export default function PublicHeader() {
  const { isAuthenticated, homePath, status } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="text-xl font-bold text-brand-800">
          {SITE_NAME}
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <Link href="/courses" className="hover:text-slate-900">Courses</Link>
          <Link href="/tutors" className="hover:text-slate-900">Tutors</Link>
          <Link href="/pages/about-us" className="hover:text-slate-900">About</Link>
        </nav>
        <div className="flex items-center gap-2">
          {status === 'loading' ? null : isAuthenticated ? (
            <Button href={homePath} size="sm">My Dashboard</Button>
          ) : (
            <>
              <Button href="/login" variant="ghost" size="sm">Log in</Button>
              <Button href="/register" size="sm">Sign up</Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
