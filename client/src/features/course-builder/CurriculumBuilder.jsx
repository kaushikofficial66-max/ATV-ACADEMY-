'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, Video } from 'lucide-react';
import { get, post, put, del } from '@/lib/api/client';
import { manage } from '@/lib/api/endpoints';
import { Badge, Button, Card, Field, Input, Select, StatusBadge, Textarea } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { QueryState, EmptyState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { builderKeys } from './keys';
import { formatDuration, humanize } from '@/lib/utils';

const LECTURE_TYPES = ['video', 'text', 'document', 'quiz', 'live_class'];

/** Sections and lectures: create, edit, delete, reorder. */
export default function CurriculumBuilder({ role, courseId }) {
  const m = manage(role);
  const key = builderKeys.curriculum(role, courseId);
  const query = useQuery({ queryKey: key, queryFn: () => get(m.curriculum(courseId)).then((r) => r.data.sections) });
  const [sectionModal, setSectionModal] = useState(null); // {} new | section
  const [lectureModal, setLectureModal] = useState(null); // { sectionId, lecture? }
  const opts = { invalidate: [key, builderKeys.course(role, courseId)] };

  const saveSection = useApiMutation(
    ({ id, ...body }) => (id ? put(m.section(id), body) : post(m.sections(courseId), body)),
    { ...opts, onSuccess: () => setSectionModal(null) }
  );
  const deleteSection = useApiMutation((id) => del(m.section(id)), opts);
  const saveLecture = useApiMutation(
    ({ id, sectionId, ...body }) => (id ? put(m.lecture(id), body) : post(m.lectures(sectionId), body)),
    { ...opts, onSuccess: () => setLectureModal(null) }
  );
  const deleteLecture = useApiMutation((id) => del(m.lecture(id)), opts);
  const reorderSections = useApiMutation((ids) => put(`${m.sections(courseId)}/reorder`, { section_ids: ids }), { ...opts, silent: true });
  const reorderLectures = useApiMutation(({ sectionId, ids }) => put(`${m.lectures(sectionId)}/reorder`, { lecture_ids: ids }), { ...opts, silent: true });

  const move = (list, index, dir) => {
    const ids = list.map((x) => x.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return null;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    return ids;
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setSectionModal({})}>
          <Plus className="size-4" aria-hidden /> Add section
        </Button>
      </div>
      <QueryState query={query} loading={<Loader />}>
        {(sections) =>
          sections.length === 0 ? (
            <Card>
              <EmptyState title="No sections yet" description="Start by adding the first section of your course." />
            </Card>
          ) : (
            <div className="space-y-4">
              {sections.map((s, si) => (
                <Card key={s.id}>
                  <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                    <div className="flex flex-col">
                      <IconBtn label="Move section up" onClick={() => { const ids = move(sections, si, -1); if (ids) reorderSections.mutate(ids); }}><ChevronUp className="size-4" /></IconBtn>
                      <IconBtn label="Move section down" onClick={() => { const ids = move(sections, si, 1); if (ids) reorderSections.mutate(ids); }}><ChevronDown className="size-4" /></IconBtn>
                    </div>
                    <p className="flex-1 font-semibold text-slate-900">
                      Section {si + 1}: {s.title}
                    </p>
                    {s.status !== 'active' && <StatusBadge status={s.status} />}
                    <IconBtn label="Edit section" onClick={() => setSectionModal(s)}><Pencil className="size-4" /></IconBtn>
                    <IconBtn label="Delete section" onClick={() => confirm(`Delete section "${s.title}" and its lectures?`) && deleteSection.mutate(s.id)}><Trash2 className="size-4" /></IconBtn>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {s.lectures.map((l, li) => (
                      <li key={l.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                        <div className="flex flex-col">
                          <IconBtn label="Move lecture up" onClick={() => { const ids = move(s.lectures, li, -1); if (ids) reorderLectures.mutate({ sectionId: s.id, ids }); }}><ChevronUp className="size-3.5" /></IconBtn>
                          <IconBtn label="Move lecture down" onClick={() => { const ids = move(s.lectures, li, 1); if (ids) reorderLectures.mutate({ sectionId: s.id, ids }); }}><ChevronDown className="size-3.5" /></IconBtn>
                        </div>
                        <span className="flex-1">{l.title}</span>
                        <Badge>{humanize(l.lecture_type)}</Badge>
                        {l.is_preview && <Badge tone="blue">Preview</Badge>}
                        {l.status !== 'published' && <StatusBadge status={l.status} />}
                        {l.video ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <Video className="size-3.5" aria-hidden /> {['ready', 'published'].includes(l.video.status) ? formatDuration(l.video.duration_seconds) : humanize(l.video.status)}
                          </span>
                        ) : l.lecture_type === 'video' ? (
                          <span className="text-xs text-amber-700">No video</span>
                        ) : null}
                        <IconBtn label="Edit lecture" onClick={() => setLectureModal({ sectionId: s.id, lecture: l })}><Pencil className="size-4" /></IconBtn>
                        <IconBtn label="Delete lecture" onClick={() => confirm(`Delete lecture "${l.title}"?`) && deleteLecture.mutate(l.id)}><Trash2 className="size-4" /></IconBtn>
                      </li>
                    ))}
                  </ul>
                  <div className="px-4 py-3">
                    <Button size="sm" variant="ghost" onClick={() => setLectureModal({ sectionId: s.id })}>
                      <Plus className="size-4" aria-hidden /> Add lecture
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </QueryState>

      <Modal open={Boolean(sectionModal)} onClose={() => setSectionModal(null)} title={sectionModal?.id ? 'Edit section' : 'New section'}>
        {sectionModal && <SectionForm section={sectionModal} saving={saveSection.isPending} onSave={(body) => saveSection.mutate({ id: sectionModal.id, ...body })} />}
      </Modal>
      <Modal open={Boolean(lectureModal)} onClose={() => setLectureModal(null)} title={lectureModal?.lecture ? 'Edit lecture' : 'New lecture'} size="lg">
        {lectureModal && (
          <LectureForm
            lecture={lectureModal.lecture}
            saving={saveLecture.isPending}
            onSave={(body) => saveLecture.mutate({ id: lectureModal.lecture?.id, sectionId: lectureModal.sectionId, ...body })}
          />
        )}
      </Modal>
    </>
  );
}

function IconBtn({ label, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
      {children}
    </button>
  );
}

function SectionForm({ section, saving, onSave }) {
  const [title, setTitle] = useState(section.title || '');
  const [description, setDescription] = useState(section.description || '');
  const [status, setStatus] = useState(section.status || 'active');
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ title, description, status });
      }}
    >
      <Field label="Title" htmlFor="section_title" required>
        <Input id="section_title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field label="Description" htmlFor="section_description">
        <Textarea id="section_description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Status" htmlFor="section_status">
        <Select id="section_status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive (hidden)</option>
        </Select>
      </Field>
      <Button type="submit" loading={saving}>
        Save section
      </Button>
    </form>
  );
}

function LectureForm({ lecture, saving, onSave }) {
  const [v, setV] = useState({
    title: lecture?.title || '',
    description: lecture?.description || '',
    lecture_type: lecture?.lecture_type || 'video',
    duration_seconds: lecture?.duration_seconds || '',
    is_preview: Boolean(lecture?.is_preview),
    status: lecture?.status || 'published'
  });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...v, duration_seconds: v.duration_seconds || undefined });
      }}
    >
      <Field label="Title" htmlFor="lecture_title" required className="sm:col-span-2">
        <Input id="lecture_title" value={v.title} onChange={set('title')} required />
      </Field>
      <Field label="Type" htmlFor="lecture_type">
        <Select id="lecture_type" value={v.lecture_type} onChange={set('lecture_type')}>
          {LECTURE_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" htmlFor="lecture_status">
        <Select id="lecture_status" value={v.status} onChange={set('status')}>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>
      <Field label="Duration (seconds)" htmlFor="lecture_duration" hint="Filled automatically for Vimeo videos">
        <Input id="lecture_duration" type="number" min="0" value={v.duration_seconds} onChange={set('duration_seconds')} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
        <input type="checkbox" checked={v.is_preview} onChange={set('is_preview')} className="accent-brand-700" /> Free preview
      </label>
      <Field label="Content / description" htmlFor="lecture_description" className="sm:col-span-2">
        <Textarea id="lecture_description" rows={6} value={v.description} onChange={set('description')} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={saving}>
          Save lecture
        </Button>
        {v.lecture_type === 'video' && <p className="mt-2 text-xs text-slate-500">Upload the video in the Videos tab and attach it to this lecture.</p>}
      </div>
    </form>
  );
}
