'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { Spinner } from '@/components/feedback/Loader';
import { authApi } from './api';
import { getErrorMessage } from '@/lib/api/client';

const MESSAGES = {
  verified: 'Your email address has been verified.',
  already_verified: 'Your email address is already verified.',
  expired: 'This verification link has expired. Log in and request a new one.',
  invalid: 'This verification link is invalid or was replaced by a newer one.'
};

/**
 * Two ways to land here:
 *  - ?status=verified|...  when the API is configured with EMAIL_VERIFICATION_REDIRECT_URL
 *  - ?token=...            when the email links to this page; we call POST /auth/verify-email
 */
export default function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get('token');
  const initialStatus = params.get('status');
  const [state, setState] = useState(() =>
    initialStatus ? { done: true, ok: ['verified', 'already_verified'].includes(initialStatus), message: MESSAGES[initialStatus] || MESSAGES.invalid } : { done: !token, ok: false, message: token ? '' : MESSAGES.invalid }
  );

  useEffect(() => {
    if (!token || initialStatus) return;
    authApi
      .verifyEmail(token)
      .then((res) => setState({ done: true, ok: true, message: MESSAGES[res.data?.status] || res.message }))
      .catch((error) => setState({ done: true, ok: false, message: getErrorMessage(error) }));
  }, [token, initialStatus]);

  if (!state.done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-sm text-slate-500">
        <Spinner className="size-8" />
        Verifying your email...
      </div>
    );
  }
  return (
    <div className="space-y-4 text-center">
      {state.ok ? <CircleCheck className="mx-auto size-12 text-green-600" /> : <TriangleAlert className="mx-auto size-12 text-amber-500" />}
      <h1 className="text-xl font-semibold text-slate-900">{state.ok ? 'Email verified' : 'Verification problem'}</h1>
      <p className="text-sm text-slate-600">{state.message}</p>
      <Button href="/login">Go to log in</Button>
    </div>
  );
}
