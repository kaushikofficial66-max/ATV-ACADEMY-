import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }) {
  return <LoaderCircle className={cn('size-5 animate-spin text-brand-600', className)} aria-label="Loading" />;
}

export function Loader({ label = 'Loading...', className }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 py-12 text-sm text-slate-500', className)}>
      <Spinner />
      {label}
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="size-8" />
    </div>
  );
}

export default Loader;
