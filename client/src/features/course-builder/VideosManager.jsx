'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Trash2 } from 'lucide-react';
import { get, post, del } from '@/lib/api/client';
import { manage } from '@/lib/api/endpoints';
import { Button, Card, CardHeader, DataTable, StatusBadge } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import VimeoUploader from '@/features/videos/VimeoUploader';
import { builderKeys } from './keys';
import { formatDuration } from '@/lib/utils';

/** Course video library: Vimeo uploads, processing status, sync and delete. */
export default function VideosManager({ role, courseId }) {
  const m = manage(role);
  const queryClient = useQueryClient();
  const key = builderKeys.videos(role, courseId);
  const videos = useQuery({
    queryKey: key,
    queryFn: () => get(m.videos(courseId)).then((r) => r.data.videos),
    // Poll while Vimeo is still transcoding something.
    refetchInterval: (q) => (q.state.data?.some((v) => v.status === 'processing') ? 15000 : false)
  });
  const curriculum = useQuery({ queryKey: builderKeys.curriculum(role, courseId), queryFn: () => get(m.curriculum(courseId)).then((r) => r.data.sections) });
  const invalidate = [key, builderKeys.curriculum(role, courseId), builderKeys.course(role, courseId)];
  const sync = useApiMutation((id) => post(m.videoSync(id)), { invalidate });
  const remove = useApiMutation((id) => del(m.video(id)), { invalidate });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Upload a video" description="Videos are stored privately on Vimeo and only play inside ATV Academy." />
        <div className="p-5">
          <VimeoUploader role={role} courseId={courseId} sections={curriculum.data || []} onUploaded={() => invalidate.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }))} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Video library" />
        <QueryState query={videos} loading={<Loader />}>
          {(rows) => (
            <DataTable
              rows={rows}
              empty="No videos uploaded yet."
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
                      <Button size="sm" variant="ghost" onClick={() => confirm(`Delete "${v.title}"? It is also removed from Vimeo.`) && remove.mutate(v.id)} aria-label="Delete video">
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
