import Link from 'next/link';
import Logo from '@/components/layout/Logo';

export const metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <Logo />
      <p className="mt-10 text-6xl font-bold text-brand-700">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-slate-600">The page you are looking for does not exist or has moved.</p>
      <Link href="/login" className="mt-6 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800">
        Go to my learning
      </Link>
    </div>
  );
}
