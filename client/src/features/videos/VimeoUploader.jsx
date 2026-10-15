'use client';

import { useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Upload as UploadIcon } from 'lucide-react';
import { post, getErrorMessage } from '@/lib/api/client';
import { manage } from '@/lib/api/endpoints';
import { Button, Field, Input, ProgressBar } from '@/components/ui';
import PlacementFields, { placementBody } from './PlacementFields';

/**
 * Uploads a video straight from the browser to Vimeo:
 *  1. POST /{role}/courses/:id/videos/direct-upload -> tus upload URL + video record
 *  2. tus-js-client sends the file to Vimeo (resumable, any size)
 * Vimeo then transcodes; the record becomes "ready" via auto-sync or "Sync".
 */
export default function VimeoUploader({ role, courseId, sections = [], onUploaded }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(''); // "s:<sectionId>" | "l:<lectureId>"
  const [createLecture, setCreateLecture] = useState(true);
  const [progress, setProgress] = useState(null);
  const uploadRef = useRef(null);

  const start = async () => {
    if (!file || !target) return;
    setProgress(0);
    try {
      const res = await post(manage(role).videoDirectUpload(courseId), {
        title: title || file.name.replace(/\.[^.]+$/, ''),
        upload_length: file.size,
        ...placementBody(target, createLecture)
      });
      const { Upload } = await import('tus-js-client');
      await new Promise((resolve, reject) => {
        const upload = new Upload(file, {
          uploadUrl: res.data.upload.url,
          chunkSize: 64 * 1024 * 1024,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          metadata: { filename: file.name, filetype: file.type },
          onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
          onSuccess: resolve,
          onError: reject
        });
        uploadRef.current = upload;
        upload.start();
      });
      toast.success('Uploaded to Vimeo. The video will be playable once Vimeo finishes processing.');
      setFile(null);
      setTitle('');
      onUploaded?.();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setProgress(null);
      uploadRef.current = null;
    }
  };

  const busy = progress !== null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Video file" htmlFor="video_file" required className="sm:col-span-2">
        <Input id="video_file" type="file" accept="video/*" className="pt-2" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </Field>
      <Field label="Title" htmlFor="video_title" hint="Defaults to the file name">
        <Input id="video_title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
      </Field>
      <PlacementFields sections={sections} target={target} onTarget={setTarget} createLecture={createLecture} onCreateLecture={setCreateLecture} disabled={busy} />
      {busy && (
        <div className="space-y-1 sm:col-span-2">
          <ProgressBar value={progress} />
          <p className="text-xs text-slate-500">Uploading to Vimeo... {progress}% - keep this tab open.</p>
        </div>
      )}
      <div className="sm:col-span-2">
        <Button onClick={start} loading={busy} disabled={!file || !target}>
          <UploadIcon className="size-4" aria-hidden /> Upload to Vimeo
        </Button>
      </div>
    </div>
  );
}
