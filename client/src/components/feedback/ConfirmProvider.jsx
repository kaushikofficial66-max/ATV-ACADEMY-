'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleHelp, LogOut, Trash2, TriangleAlert } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

const ConfirmContext = createContext(null);

const TONES = {
  danger: { icon: Trash2, ring: 'bg-red-100 text-red-600', button: 'danger' },
  warning: { icon: TriangleAlert, ring: 'bg-amber-100 text-amber-600', button: 'primary' },
  logout: { icon: LogOut, ring: 'bg-brand-100 text-brand-700', button: 'primary' },
  primary: { icon: CircleHelp, ring: 'bg-brand-100 text-brand-700', button: 'primary' }
};

/**
 * App-wide confirmation dialog (replaces the browser's confirm()).
 *
 *   const ask = useConfirm();
 *   if (await ask({ title: 'Delete course?', message: 'This cannot be undone.', confirmLabel: 'Delete' })) remove.mutate();
 *   if (await ask('Mark as paid?')) ...                      // a plain string is the message
 *
 * options: title, message, confirmLabel, cancelLabel, tone: 'danger' (default) | 'warning' | 'logout' | 'primary'
 *          input: { label, placeholder }  adds an optional text field (replaces the browser's prompt())
 * Resolves true on confirm, false on Cancel / Escape / tapping outside.
 * With `input` it resolves { value } (trimmed, '' when left empty) on confirm and null on cancel:
 *   const r = await ask({ title: 'Reject?', input: { label: 'Reason (optional)' } });
 *   if (r) reject.mutate({ reason: r.value || undefined });
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);
  const cancelRef = useRef(null);
  const inputRef = useRef(null);
  const [value, setValue] = useState('');

  const ask = useCallback((options) => {
    const opts = typeof options === 'string' ? { message: options } : options || {};
    // A second dialog while one is open cancels the first.
    resolver.current?.(null);
    return new Promise((resolve) => {
      resolver.current = resolve;
      setValue('');
      setState({ tone: 'danger', confirmLabel: 'Confirm', cancelLabel: 'Cancel', title: 'Are you sure?', ...opts });
    });
  }, []);

  const close = useCallback((result) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  }, []);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => e.key === 'Escape' && close(state.input ? null : false);
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (inputRef.current || cancelRef.current)?.focus(); // the safe choice has focus, so a stray Enter cannot delete anything
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [state, close]);

  const confirmNow = () => close(state?.input ? { value: value.trim() } : true);
  const cancelNow = () => close(state?.input ? null : false);

  const tone = TONES[state?.tone] || TONES.danger;
  const Icon = tone.icon;

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 fade-in" onMouseDown={(e) => e.target === e.currentTarget && cancelNow()}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-4">
              <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', tone.ring)}>
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="confirm-title" className="text-base font-semibold text-slate-900">
                  {state.title}
                </h2>
                {state.message && (
                  <p id="confirm-message" className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {state.message}
                  </p>
                )}
              </div>
            </div>
            {state.input && (
              <div className="mt-4">
                <label htmlFor="confirm-input" className="mb-1.5 block text-sm font-medium text-slate-700">
                  {state.input.label}
                </label>
                <Input ref={inputRef} id="confirm-input" value={value} placeholder={state.input.placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmNow()} />
              </div>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button ref={cancelRef} type="button" variant="secondary" onClick={cancelNow}>
                {state.cancelLabel}
              </Button>
              <Button type="button" variant={tone.button} onClick={() => confirmNow()}>
                {state.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm must be used inside <ConfirmProvider>.');
  return ask;
}
