import Logo from '@/components/layout/Logo';

/** Slim header for the few public pages (legal pages, certificate verification). */
export default function PublicHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Logo imgClassName="h-9" />
        <a href="/login" className="text-sm font-medium text-brand-700 hover:underline">
          Log in
        </a>
      </div>
    </header>
  );
}
