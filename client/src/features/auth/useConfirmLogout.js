'use client';

import { useCallback } from 'react';
import { useConfirm } from '@/components/feedback/ConfirmProvider';
import { useAuth } from '@/features/auth/AuthProvider';

/**
 * Returns a logout function that first asks "Log out?". While an admin is previewing another
 * account ("view as"), it exits the preview straight away - nothing to confirm there.
 */
export function useConfirmLogout() {
  const { logout, impersonator } = useAuth();
  const ask = useConfirm();
  return useCallback(async () => {
    if (impersonator) return logout();
    const ok = await ask({
      title: 'Log out?',
      message: 'You will need to log in again to continue learning.',
      confirmLabel: 'Log out',
      tone: 'logout'
    });
    if (ok) return logout();
    return undefined;
  }, [logout, impersonator, ask]);
}
