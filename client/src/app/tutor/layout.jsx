import RoleGuard from '@/lib/auth/RoleGuard';
import PanelShell from '@/components/layout/PanelShell';

export const metadata = { robots: { index: false, follow: false } };

/** Tutor panel: only accounts with the tutor role can open these pages. */
export default function TutorLayout({ children }) {
  return (
    <RoleGuard role="tutor">
      <PanelShell role="tutor">{children}</PanelShell>
    </RoleGuard>
  );
}
