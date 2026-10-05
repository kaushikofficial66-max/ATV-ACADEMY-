'use client';

import { Avatar, Badge } from '@/components/ui';
import { cn, fullName } from '@/lib/utils';

/**
 * Pick one or more tutors and mark one as the main one (host / primary).
 * value: { ids: number[], mainId: number | null }
 * locked: ids that are always selected (e.g. the tutor who is scheduling).
 */
export default function TutorPicker({ tutors = [], value, onChange, mainLabel = 'Host', locked = [], empty = 'No tutors available.' }) {
  const { ids, mainId } = value;
  if (!tutors.length) return <p className="text-sm text-slate-500">{empty}</p>;

  const toggle = (id) => {
    if (locked.includes(id)) return;
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    const nextMain = next.includes(mainId) ? mainId : next[0] ?? null;
    onChange({ ids: next, mainId: nextMain });
  };

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {tutors.map((t) => {
        const checked = ids.includes(t.id);
        return (
          <li key={t.id} className={cn('flex items-center gap-3 px-3 py-2 text-sm', checked && 'bg-brand-50/40')}>
            <input
              type="checkbox"
              checked={checked}
              disabled={locked.includes(t.id)}
              onChange={() => toggle(t.id)}
              aria-label={`Select ${fullName(t)}`}
              className="accent-brand-700"
            />
            <Avatar user={t} size={28} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">{fullName(t)}</p>
              <p className="truncate text-xs text-slate-500">{t.email}</p>
            </div>
            {checked &&
              (mainId === t.id ? (
                <Badge tone="blue">{mainLabel}</Badge>
              ) : (
                <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => onChange({ ids, mainId: t.id })}>
                  Make {mainLabel.toLowerCase()}
                </button>
              ))}
          </li>
        );
      })}
    </ul>
  );
}
