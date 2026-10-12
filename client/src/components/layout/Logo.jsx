'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LOGO_URL, SITE_NAME } from '@/lib/config';
import { cn } from '@/lib/utils';

/** Brand logo (image) with a text fallback if the image cannot be loaded. */
export default function Logo({ href = '/login', className, imgClassName = 'h-10', showName = false }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5', className)} aria-label={SITE_NAME}>
      {!broken && LOGO_URL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={LOGO_URL} alt={SITE_NAME} className={cn('w-auto', imgClassName)} onError={() => setBroken(true)} />
      ) : (
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">AV</span>
      )}
      {(showName || broken) && <span className="text-lg font-bold tracking-tight text-slate-900">{SITE_NAME}</span>}
    </Link>
  );
}
