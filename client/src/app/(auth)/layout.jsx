import Link from 'next/link';
import { SITE_NAME } from '@/lib/config';

export const metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-bold text-brand-800">
        {SITE_NAME}
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">{children}</div>
    </div>
  );
}
