'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import { ROLE_HOME } from '@/config/constants';
import { FullPageLoader } from '@/components/feedback/Loader';
import PendingApproval from '@/components/feedback/PendingApproval';

/**
 * Protects a panel: guests go to /login?next=..., users with another role go
 * to their own panel, tutors awaiting approval see a holding screen.
 */
export default function RoleGuard({ role, children }) {
  const { status, role: userRole, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'guest') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (status === 'authenticated' && userRole !== role) router.replace(ROLE_HOME[userRole] || '/');
  }, [status, userRole, role, router, pathname]);

  if (status !== 'authenticated' || userRole !== role) return <FullPageLoader />;
  if (role === 'tutor' && user?.status === 'pending') return <PendingApproval />;
  return children;
}
