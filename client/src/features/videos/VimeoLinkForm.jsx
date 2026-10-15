'use client';

import { useState } from 'react';
import { toast } from 'react-toastify';
import { Link2 } from 'lucide-react';
import { post, getErrorMessage } from '@/lib/api/client';
import { manage } from '@/lib/api/endpoints';
import { Button, Field, Input, Textarea } from '@/components/ui';
import PlacementFields, { placementBody } from './PlacementFields';

/** Pulls the address out of pasted embed code (<iframe src="...">); anything else is used as typed. */
const extractLink = (text) => {
  const src = String(text).match(/src\s*=\s*["']([^"']+)["']/i);
  return (src ? src[1] : String(text)).trim();
};

const looksLikeVimeo = (link) => /vimeo\.com\/|^\d{6,}$/i.test(link);

const PLACEHOLDER = 'https://vimeo.com/123456789   or the embed code from Vimeo';

/**
 * Adds a video that is ALREADY on your Vimeo account by pasting its link or embed code.
 * The server reads the video id, checks it on Vimeo, and adds it to the chosen lecture / module.
 */
export default function VimeoLinkForm({ role, courseId, sections = [], onAdded }) {
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [createLecture, setCreateLecture] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const clean = extractLink(link);
  const submit = async () => {
    if (!looksLikeVimeo(clean)) {
      setProblem('That does not look like a Vimeo link. Use e.g. https://vimeo.com/123456789 or the embed code from Vimeo.');
      return;
    }
    setProblem('');
    setBusy(true);
    try {
      const res = await post(manage(role).videos(courseId), { vimeo_url: clean, ...(title.trim() && { title: title.trim() }), ...placementBody(target, createLecture) });
      toast.success(res.message || 'Vimeo video added.');
      if (res.data?.warning) toast.warning(res.data.warning, { autoClose: 15000 });
      setLink('');
      setTitle('');
      onAdded?.();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Vimeo link or embed code"
        htmlFor="vimeo_link"
        required
        error={problem}
        hint="Paste the video's link (vimeo.com/123456789) or the whole embed code from Vimeo > Share > Embed. The video must be on your own Vimeo account."
        className="sm:col-span-2"
      >
        <Textarea id="vimeo_link" rows={3} value={link} onChange={(e) => setLink(e.target.value)} placeholder={PLACEHOLDER} disabled={busy} invalid={Boolean(problem)} />
      </Field>
      <Field label="Title" htmlFor="vimeo_title" hint="Leave empty to use the title from Vimeo">
        <Input id="vimeo_title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
      </Field>
      <PlacementFields idPrefix="vimeo" sections={sections} target={target} onTarget={setTarget} createLecture={createLecture} onCreateLecture={setCreateLecture} disabled={busy} />
      <div className="sm:col-span-2">
        <Button onClick={submit} loading={busy} disabled={!clean || !target}>
          <Link2 className="size-4" aria-hidden /> Add Vimeo video
        </Button>
      </div>
    </div>
  );
}
