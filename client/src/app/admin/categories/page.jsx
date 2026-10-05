'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { del, upload } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Field, Input, PageHeader, Select, StatusBadge, Textarea } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { assetUrl } from '@/lib/utils';

const KEY = ['admin', 'categories'];

export default function AdminCategoriesPage() {
  const [editing, setEditing] = useState(null);
  const remove = useApiMutation((id) => del(EP.admin.category(id)), { invalidate: [KEY, ['public', 'categories']] });

  return (
    <>
      <PageHeader
        title="Categories"
        actions={
          <Button onClick={() => setEditing({})}>
            <Plus className="size-4" aria-hidden /> New category
          </Button>
        }
      />
      <ResourceList
        queryKey={KEY}
        endpoint={EP.admin.categories}
        dataKey="categories"
        filters={[{ name: 'status', label: 'Status', options: ['active', 'inactive'] }]}
        onRowClick={setEditing}
        columns={[
          {
            key: 'name',
            header: 'Name',
            render: (c) => (
              <div className="flex items-center gap-2">
                {c.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(c.image_url)} alt="" className="size-8 rounded object-cover" />
                )}
                <span className="font-medium text-slate-900">{c.name}</span>
              </div>
            )
          },
          { key: 'slug', header: 'Slug' },
          { key: 'course_count', header: 'Courses' },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          {
            key: 'actions',
            header: '',
            render: (c) => (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${c.name}"?`)) remove.mutate(c.id);
                }}
              >
                Delete
              </Button>
            )
          }
        ]}
      />
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit category' : 'New category'}>
        {editing && <CategoryForm category={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function CategoryForm({ category, onDone }) {
  const [v, setV] = useState({ name: category.name || '', description: category.description || '', status: category.status || 'active' });
  const [image, setImage] = useState(null);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const save = useApiMutation(
    () => {
      const fd = new FormData();
      Object.entries(v).forEach(([k, val]) => fd.append(k, val));
      if (image) fd.append('image', image);
      return category.id ? upload(EP.admin.category(category.id), fd, { method: 'put' }) : upload(EP.admin.categories, fd);
    },
    { invalidate: [KEY, ['public', 'categories']], onSuccess: onDone }
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Name" htmlFor="cat_name" required>
        <Input id="cat_name" value={v.name} onChange={set('name')} required />
      </Field>
      <Field label="Description" htmlFor="cat_description">
        <Textarea id="cat_description" rows={3} value={v.description} onChange={set('description')} />
      </Field>
      <Field label="Image" htmlFor="cat_image">
        <Input id="cat_image" type="file" accept="image/*" className="pt-2" onChange={(e) => setImage(e.target.files?.[0] || null)} />
      </Field>
      <Field label="Status" htmlFor="cat_status">
        <Select id="cat_status" value={v.status} onChange={set('status')}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>
      <Button type="submit" loading={save.isPending}>
        Save
      </Button>
    </form>
  );
}
