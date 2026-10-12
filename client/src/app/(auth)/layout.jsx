import { BookOpen, PlayCircle, ShieldCheck } from 'lucide-react';
import Logo from '@/components/layout/Logo';
import { SITE_NAME } from '@/lib/config';

export const metadata = { robots: { index: false, follow: false } };

const POINTS = [
  { icon: PlayCircle, title: 'Learn at your pace', text: 'Recorded lessons and live classes, all in one place.' },
  { icon: BookOpen, title: 'Track your progress', text: 'Pick up exactly where you left off on any device.' },
  { icon: ShieldCheck, title: 'Certificates', text: 'Complete your course and download your certificate.' }
];

/** Login / password screens: brand panel on the left (desktop), form card on the right. */
export default function AuthLayout({ children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/5" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-[28rem] rounded-full bg-white/5" aria-hidden />
        <span className="relative inline-flex w-fit rounded-xl bg-white px-4 py-2 shadow-lg shadow-black/10">
          <Logo imgClassName="h-9" />
        </span>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">Welcome to your learning portal</h2>
          <p className="mt-4 text-lg text-brand-100">Everything for your {SITE_NAME} course, right here.</p>
          <ul className="mt-10 space-y-6">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                  <p.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm text-brand-100">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-brand-200">&copy; {new Date().getFullYear()} {SITE_NAME}</p>
      </aside>

      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-8 sm:px-8 sm:py-10 lg:min-h-0">
        <div className="mb-8 lg:hidden">
          <Logo imgClassName="h-12" />
        </div>
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-10">{children}</div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Having trouble? Write to us at{' '}
          <a href="mailto:support@antarikshtv.com" className="font-medium text-brand-700 hover:underline">
            support@antarikshtv.com
          </a>
        </p>
      </main>
    </div>
  );
}
