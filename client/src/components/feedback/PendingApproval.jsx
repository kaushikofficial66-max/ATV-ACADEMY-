'use client';

import { Clock } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';

/** Shown to tutors whose account is waiting for admin approval. */
export default function PendingApproval() {
  const { user, logout, refresh } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Clock className="mx-auto mb-4 size-12 text-amber-500" aria-hidden />
        <h1 className="text-xl font-semibold text-slate-900">Your tutor account is awaiting approval</h1>
        <p className="mt-2 text-sm text-slate-600">
          Thanks for applying, {user?.first_name}. An administrator will review your account soon - you will get an email and a
          notification once it is approved.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="secondary" onClick={() => refresh()}>
            Check again
          </Button>
          <Button variant="ghost" onClick={logout}>
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
