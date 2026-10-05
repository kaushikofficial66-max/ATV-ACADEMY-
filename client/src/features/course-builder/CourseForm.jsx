'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { get, upload, getErrorMessage, getFieldErrors } from '@/lib/api/client';
import { EP, manage } from '@/lib/api/endpoints';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { COURSE_LEVELS } from '@/config/constants';
import { assetUrl, fullName, humanize } from '@/lib/utils';
import { builderKeys } from './keys';

/** Create (no `course`) or edit a course. Multipart because of the thumbnail. */
export default function CourseForm({ role, course }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAdmin = role === 'admin';
  const [thumb, setThumb] = useState(null);
  const [saving, setSaving] = useState(false);

  const categories = useQuery({ queryKey: ['public', 'categories'], queryFn: () => get(EP.public.categories).then((r) => r.data.categories) });
  const tutors = useQuery({
    queryKey: ['admin', 'tutor-options'],
    queryFn: () => get(EP.admin.tutors, { status: 'active', limit: 100 }).then((r) => r.data.tutors),
    enabled: isAdmin && !course
  });

  const { register, handleSubmit, setError, formState } = useForm({
    defaultValues: {
      title: course?.title || '',
      category_id: course?.category_id || '',
      short_description: course?.short_description || '',
      description: course?.description || '',
      price: course?.price ?? 0,
      discount_price: course?.discount_price ?? '',
      level: course?.level || 'beginner',
      language: course?.language || 'English',
      duration_minutes: course?.duration_minutes ?? '',
      tutor_id: ''
    }
  });

  const onSubmit = async (values) => {
    setSaving(true);
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (k === 'tutor_id' && (!isAdmin || course || !v)) return;
      fd.append(k, v ?? '');
    });
    if (thumb) fd.append('thumbnail', thumb);
    try {
      const m = manage(role);
      const res = course ? await upload(m.course(course.id), fd, { method: 'put' }) : await upload(m.courses, fd);
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: builderKeys.all(role) });
      if (!course) router.push(`/${role}/courses/${res.data.course.id}/curriculum`);
    } catch (err) {
      Object.entries(getFieldErrors(err)).forEach(([field, message]) => setError(field, { message }));
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const err = (name) => formState.errors[name]?.message;

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Title" htmlFor="title" required error={err('title')} className="sm:col-span-2">
          <Input id="title" {...register('title', { required: 'Title is required' })} />
        </Field>
        <Field label="Category" htmlFor="category_id" required error={err('category_id')}>
          <Select id="category_id" {...register('category_id', { required: 'Category is required' })}>
            <option value="">Select a category</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Level" htmlFor="level">
          <Select id="level" {...register('level')}>
            {COURSE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {humanize(l)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Price (INR)" htmlFor="price" hint="0 for a free course" error={err('price')}>
          <Input id="price" type="number" min="0" step="0.01" {...register('price')} />
        </Field>
        <Field label="Discount price (INR)" htmlFor="discount_price" error={err('discount_price')}>
          <Input id="discount_price" type="number" min="0" step="0.01" {...register('discount_price')} />
        </Field>
        <Field label="Language" htmlFor="language">
          <Input id="language" {...register('language')} />
        </Field>
        <Field label="Duration (minutes)" htmlFor="duration_minutes">
          <Input id="duration_minutes" type="number" min="0" {...register('duration_minutes')} />
        </Field>
        {isAdmin && !course && (
          <Field label="Primary tutor" htmlFor="tutor_id" hint="Optional - the tutor who will manage this course">
            <Select id="tutor_id" {...register('tutor_id')}>
              <option value="">None</option>
              {tutors.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {fullName(t)} ({t.email})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Thumbnail" htmlFor="thumbnail" hint="JPG / PNG / WebP, 16:9 recommended">
          <div className="flex items-center gap-3">
            {course?.thumbnail_url && !thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assetUrl(course.thumbnail_url)} alt="" className="h-10 w-16 rounded object-cover" />
            )}
            <Input id="thumbnail" type="file" accept="image/*" className="pt-2" onChange={(e) => setThumb(e.target.files?.[0] || null)} />
          </div>
        </Field>
        <Field label="Short description" htmlFor="short_description" className="sm:col-span-2">
          <Textarea id="short_description" rows={2} {...register('short_description')} />
        </Field>
        <Field label="Description" htmlFor="description" className="sm:col-span-2">
          <Textarea id="description" rows={8} {...register('description')} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={saving}>
            {course ? 'Save changes' : 'Create course'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
