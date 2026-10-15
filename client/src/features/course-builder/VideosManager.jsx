'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Trash2 } from 'lucide-react';
import { get, post, del } from '@/lib/api/client';
import { manage } from '@/lib/api/endpoints';
import { Button, Card, CardHeader, DataTable, StatusBadge } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import VimeoUploader from '@/features/videos/VimeoUploader';
import VimeoLinkForm from '@/features/videos/VimeoLinkForm';
import { builderKeys } from './keys';
import { cn, formatDuration } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const MODES = [
  ['link', 'Use a Vimeo link'],
  ['upload', 'Upload a file']
];

/** Course video library: add by Vimeo link or upload, processing status, sync and delete. */
export default function VideosManager({ role, courseId }) {
  const m = manage(role);
  const ask = useConfirm();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('link');
  const key = builderKeys.videos(role, courseId);
  const videos = useQuery({
    queryKey: key,
    queryFn: () => get(m.videos(courseId)).then((r) => r.data.videos),
    // Poll while Vimeo is still transcoding something.
    refetchInterval: (q) => (q.state.data?.some((v) => v.status === 'processing') ? 15000 : false)
  });
  const curriculum = useQuery({ queryKey: builderKeys.curriculum(role, courseId), queryFn: () => get(m.curriculum(courseId)).then((r) => r.data.sections) });
  const invalidate = [key, builderKeys.curriculum(role, courseId), builderKeys.course(role, courseId)];
  const refresh = () => invalidate.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
  const sync = useApiMutation((id) => post(m.videoSync(id)), { invalidate });
  const remove = useApiMutation((id) => del(m.video(id)), { invalidate });
  const sections = curriculum.data || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Add a video" description="Use a video already on your Vimeo account, or upload a new file. Videos only play inside ATV Academy." />
        <div className="border-b border-slate-100 px-5">
          <div className="flex gap-6" role="tablist">
            {MODES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id)}
                className={cn('-mb-px border-b-2 py-3 text-sm font-medium transition-colors', mode === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-5">
          {mode === 'link' ? (
            <VimeoLinkForm role={role} courseId={courseId} sections={sections} onAdded={refresh} />
          ) : (
            <VimeoUploader role={role} courseId={courseId} sections={sections} onUploaded={refresh} />
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Video library" />
        <QueryState query={videos} loading={<Loader />}>
          {(rows) => (
            <DataTable
              rows={rows}
              empty="No videos added yet."
              columns={[
                { key: 'title', header: 'Title', render: (v) => <span className="font-medium text-slate-900">{v.title}</span> },
                { key: 'placement', header: 'Lecture', render: (v) => v.lecture?.title || <span className="text-slate-400">{v.section?.title} (unassigned)</span> },
                { key: 'duration_seconds', header: 'Duration', render: (v) => (v.duration_seconds ? formatDuration(v.duration_seconds) : '-') },
                { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status} /> },
                {
                  key: 'actions',
                  header: '',
                  render: (v) => (
                    <div className="flex justify-end gap-1">
                      {v.vimeo_video_id && (
                        <Button size="sm" variant="ghost" onClick={() => sync.mutate(v.id)} title="Refresh status from Vimeo">
                          <RefreshCw className="size-4" aria-hidden /> Sync
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () =>
                          (await ask({
                            title: 'Delete video?',
                            message: `"${v.title}" will be removed from the course. Videos uploaded through the LMS are also deleted from Vimeo; linked Vimeo videos stay on your Vimeo account.`,
                            confirmLabel: 'Delete'
                          })) && remove.mutate(v.id)
                        }
                        aria-label="Delete video"
                      >
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
