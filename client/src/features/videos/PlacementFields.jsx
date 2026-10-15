'use client';

import { Field, Select } from '@/components/ui';

/**
 * "Place in" selector shared by the video forms: a module (creates a new lecture) or an existing
 * lecture (replaces its video). `target` is "s:<sectionId>" or "l:<lectureId>".
 */
export default function PlacementFields({ sections = [], target, onTarget, createLecture, onCreateLecture, disabled, idPrefix = 'video' }) {
  return (
    <>
      <Field label="Place in" htmlFor={`${idPrefix}_target`} required>
        <Select id={`${idPrefix}_target`} value={target} onChange={(e) => onTarget(e.target.value)} disabled={disabled}>
          <option value="">Select a module or lecture</option>
          {sections.map((s) => (
            <optgroup key={s.id} label={`${s.title}${s.status === 'inactive' ? ' (hidden from students)' : ''}`}>
              <option value={`s:${s.id}`}>{s.title} - new lecture</option>
              {s.lectures.map((l) => (
                <option key={l.id} value={`l:${l.id}`}>
                  Lecture: {l.title}
                  {l.video ? ' (replace video)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      {target.startsWith('s:') && (
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={createLecture} onChange={(e) => onCreateLecture(e.target.checked)} className="accent-brand-700" disabled={disabled} />
          Create a new lecture for this video (students see it in this module)
        </label>
      )}
    </>
  );
}

/** Splits a "s:12" / "l:7" target into the request fields. */
export const placementBody = (target, createLecture) => {
  const [kind, id] = target.split(':');
  return kind === 's' ? { section_id: Number(id), create_lecture: createLecture } : { lecture_id: Number(id) };
};
