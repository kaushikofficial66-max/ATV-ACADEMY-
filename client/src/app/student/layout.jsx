import RoleGuard from '@/lib/auth/RoleGuard';
import PanelShell from '@/components/layout/PanelShell';

export const metadata = { robots: { index: false, follow: false } };

/** Student panel: only accounts with the student role can open these pages. */
export default function StudentLayout({ children }) {
  return (
    <RoleGuard role="student">
      <PanelShell role="student">{children}</PanelShell>
    </RoleGuard>
  );
}
