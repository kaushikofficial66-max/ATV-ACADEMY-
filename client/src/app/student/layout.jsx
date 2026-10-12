import RoleGuard from '@/lib/auth/RoleGuard';
import StudentShell from '@/components/layout/StudentShell';

export const metadata = { robots: { index: false, follow: false } };

/** Student panel: only accounts with the student role can open these pages. */
export default function StudentLayout({ children }) {
  return (
    <RoleGuard role="student">
      <StudentShell>{children}</StudentShell>
    </RoleGuard>
  );
}
