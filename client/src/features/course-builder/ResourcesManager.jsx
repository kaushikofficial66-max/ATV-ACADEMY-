'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { get, del, upload, downloadFile } from '@/lib/api/client';
import { manage } from '@/lib/api/endpoints';
import { Button, Card, CardHeader, DataTable, Field, Input, ProgressBar, Select } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { builderKeys } from './keys';
import { formatDate } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const formatSize = (bytes) => (bytes ? `${(bytes / 1024 / 1024).toFixed(bytes > 1024 * 1024 ? 1 : 2)} MB` : '-');

/** Downloadable course files (PDFs, slides, code...) stored on Cloudflare R2. */
export default function ResourcesManager({ role, courseId }) {
  const m = manage(role);
  const key = builderKeys.resources(role, courseId);
  const ask = useConfirm();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [lectureId, setLectureId] = useState('');
  const [pct, setPct] = useState(0);
  const resources = useQuery({ queryKey: key, queryFn: () => get(m.resources(courseId)).then((r) => r.data.resources) });
  const curriculum = useQuery({ queryKey: builderKeys.curriculum(role, courseId), queryFn: () => get(m.curriculum(courseId)).then((r) => r.data.sections) });

  const add = useApiMutation(
    () => {
      const fd = new FormData();
      fd.append('resource_file', file);
      if (title) fd.append('title', title);
      if (lectureId) fd.append('lecture_id', lectureId);
      return upload(m.resources(courseId), fd, { onProgress: setPct });
    },
    {
      invalidate: [key],
      onSuccess: () => {
        setFile(null);
        setTitle('');
        setPct(0);
      }
    }
  );
  const remove = useApiMutation((id) => del(m.resource(id)), { invalidate: [key] });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Add a resource" />
        <form
          className="grid gap-4 p-5 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (file) add.mutate();
          }}
        >
          <Field label="File" htmlFor="resource_file" required>
            <Input id="resource_file" type="file" className="pt-2" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </Field>
          <Field label="Title" htmlFor="resource_title">
            <Input id="resource_title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Attach to lecture" htmlFor="resource_lecture">
            <Select id="resource_lecture" value={lectureId} onChange={(e) => setLectureId(e.target.value)}>
              <option value="">Whole course</option>
              {curriculum.data?.map((s) => (
                <optgroup key={s.id} label={s.title}>
                  {s.lectures.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          {add.isPending && <ProgressBar value={pct} className="sm:col-span-3" />}
          <div className="sm:col-span-3">
            <Button type="submit" loading={add.isPending} disabled={!file}>
              Upload
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Resources" />
        <QueryState query={resources} loading={<Loader />}>
          {(rows) => (
            <DataTable
              rows={rows}
              empty="No resources yet."
              columns={[
                { key: 'title', header: 'Title', render: (r) => <span className="font-medium text-slate-900">{r.title}</span> },
                { key: 'lecture', header: 'Lecture', render: (r) => r.lecture?.title || 'Whole course' },
                { key: 'file_size', header: 'Size', render: (r) => formatSize(r.file_size) },
                { key: 'created_at', header: 'Added', render: (r) => formatDate(r.created_at) },
                {
                  key: 'actions',
                  header: '',
                  render: (r) => (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => downloadFile(`${m.resource(r.id)}/download`, r.file_name)}>
                        Download
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => (await ask({ title: 'Delete resource?', message: 'This resource will be deleted.', confirmLabel: 'Delete' })) && remove.mutate(r.id)} aria-label="Delete resource">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )
                }
              ]}
            />
          )}
        </QueryState>
      </Card>
    </div>
  );
}
