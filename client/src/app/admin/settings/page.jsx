'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { get, put, post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { cn, humanize } from '@/lib/utils';

const KEY = ['admin', 'settings'];
const TESTABLE = ['email', 'whatsapp', 'zoom', 'storage'];

/**
 * Platform settings grouped like the API (general, payment, email, whatsapp,
 * zoom, storage). Secrets come back masked; leaving a masked value unchanged
 * keeps the stored secret.
 */
export default function AdminSettingsPage() {
  const [group, setGroup] = useState('general');
  const query = useQuery({ queryKey: KEY, queryFn: () => get(EP.admin.settings).then((r) => r.data) });

  return (
    <>
      <PageHeader title="Settings" />
      <QueryState query={query} loading={<Loader />}>
        {(d) => (
          <>
            <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Settings groups">
              {d.groups.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  className={cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', group === g ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800')}
                >
                  {humanize(g)}
                </button>
              ))}
            </nav>
            <SettingsForm key={group} group={group} settings={d.settings[group] || {}} />
          </>
        )}
      </QueryState>
    </>
  );
}

function SettingsForm({ group, settings }) {
  const initial = Object.fromEntries(Object.entries(settings).map(([k, s]) => [k, s.value ?? '']));
  const [values, setValues] = useState(initial);
  const save = useApiMutation(
    () => {
      const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => String(v) !== String(initial[k])));
      return put(EP.admin.settingsGroup(group), changed);
    },
    { invalidate: [KEY] }
  );
  const test = useApiMutation(() => post(EP.admin.settingsTest(group), {}));

  return (
    <Card className="max-w-3xl">
      <CardHeader title={`${humanize(group)} settings`} />
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {Object.entries(settings).map(([key, s]) => (
          <Field
            key={key}
            htmlFor={key}
            label={
              <span className="inline-flex items-center gap-2">
                {humanize(key)}
                {s.is_configured && <CircleCheck className="size-3.5 text-green-600" aria-label="Configured" />}
                <Badge>{s.source}</Badge>
              </span>
            }
            hint={s.is_secret ? 'Secret - leave the masked value to keep the current one' : undefined}
          >
            <Input
              id={key}
              type={s.is_secret ? 'password' : 'text'}
              autoComplete="off"
              value={typeof values[key] === 'object' ? JSON.stringify(values[key]) : values[key]}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            />
          </Field>
        ))}
        {Object.keys(settings).length === 0 && <p className="text-sm text-slate-500">No settings in this group.</p>}
        <div className="flex gap-2">
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
          {TESTABLE.includes(group) && (
            <Button type="button" variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
              Test connection
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
