import RoleGuard from '@/lib/auth/RoleGuard';
import PanelShell from '@/components/layout/PanelShell';

export const metadata = { robots: { index: false, follow: false } };

/** Admin panel: only accounts with the admin role can open these pages. */
export default function AdminLayout({ children }) {
  return (
    <RoleGuard role="admin">
      <PanelShell role="admin">{children}</PanelShell>
    </RoleGuard>
  );
}
