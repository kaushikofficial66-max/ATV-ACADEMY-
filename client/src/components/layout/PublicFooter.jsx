import Link from 'next/link';
import { SITE_NAME } from '@/lib/config';

const LINKS = [
  { href: '/pages/about-us', label: 'About Us' },
  { href: '/pages/contact-us', label: 'Contact' },
  { href: '/pages/terms-and-conditions', label: 'Terms' },
  { href: '/pages/privacy-policy', label: 'Privacy' },
  { href: '/pages/refund-policy', label: 'Refund Policy' }
];

export default function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-slate-800">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
