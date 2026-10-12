'use client';

import { usePathname } from 'next/navigation';
import PanelShell from '@/components/layout/PanelShell';

/** The lecture player brings its own full-screen layout; every other student page uses the panel shell. */
const PLAYER_PATH = /^\/student\/learn\/[^/]+\/lecture\//;

export default function StudentShell({ children }) {
  const pathname = usePathname();
  if (PLAYER_PATH.test(pathname)) return children;
  return <PanelShell role="student">{children}</PanelShell>;
}
