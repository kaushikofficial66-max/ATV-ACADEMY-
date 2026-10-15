'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { get, post, put, del, upload } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, CardHeader, DataTable, Field, Input, PageHeader, Select, StatusBadge, Textarea } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { formatDate } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const PAGES_KEY = ['admin', 'cms', 'pages'];
const CONTENTS_KEY = ['admin', 'cms', 'contents'];

/** Website content: static pages (About, Terms...) and homepage blocks. */
export default function AdminCmsPage() {
  return (
    <>
      <PageHeader title="Website (CMS)" description="Static pages and homepage content blocks" />
      <div className="space-y-6">
        <PagesSection />
        <ContentsSection />
      </div>
    </>
  );
}

function PagesSection() {
  const ask = useConfirm();
  const [editing, setEditing] = useState(null);
  const query = useQuery({ queryKey: PAGES_KEY, queryFn: () => get(EP.admin.cmsPages).then((r) => r.data.pages) });
  const remove = useApiMutation((id) => del(EP.admin.cmsPage(id)), { invalidate: [PAGES_KEY] });

  return (
    <Card>
      <CardHeader
        title="Pages"
        description="Published pages are available at /pages/<slug>"
        action={
          <Button size="sm" onClick={() => setEditing({})}>
            <Plus className="size-4" aria-hidden /> New page
          </Button>
        }
      />
      <QueryState query={query} loading={<Loader />}>
        {(pages) => (
          <DataTable
            rows={pages}
            empty="No pages yet."
            onRowClick={(p) => setEditing(p)}
            columns={[
              { key: 'title', header: 'Title', render: (p) => <span className="font-medium text-slate-900">{p.title}</span> },
              { key: 'slug', header: 'URL', render: (p) => `/pages/${p.slug}` },
              { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
              { key: 'updated_at', header: 'Updated', render: (p) => formatDate(p.updated_at) },
              {
                key: 'actions',
                header: '',
                render: (p) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await ask({ title: 'Delete page?', message: `"${p.title}" will be deleted.`, confirmLabel: 'Delete' })) remove.mutate(p.id);
                    }}
                  >
                    Delete
                  </Button>
                )
              }
            ]}
          />
        )}
      </QueryState>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit page' : 'New page'} size="xl">
        {editing && <PageForm page={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </Card>
  );
}

function PageForm({ page, onDone }) {
  const detail = useQuery({ queryKey: [...PAGES_KEY, page.id], queryFn: () => get(EP.admin.cmsPage(page.id)).then((r) => r.data.page), enabled: Boolean(page.id) });
  if (page.id && !detail.data) return <Loader />;
  return <PageFormFields page={detail.data || page} onDone={onDone} />;
}

function PageFormFields({ page, onDone }) {
  const [v, setV] = useState({
    title: page.title || '',
    slug: page.slug || '',
    content: page.content || '',
    meta_title: page.meta_title || '',
    meta_description: page.meta_description || '',
    status: page.status || 'draft'
  });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const save = useApiMutation(() => (page.id ? put(EP.admin.cmsPage(page.id), v) : post(EP.admin.cmsPages, v)), { invalidate: [PAGES_KEY], onSuccess: onDone });

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Title" htmlFor="pg_title" required>
        <Input id="pg_title" value={v.title} onChange={set('title')} required />
      </Field>
      <Field label="Slug" htmlFor="pg_slug" hint="Generated from the title when empty">
        <Input id="pg_slug" value={v.slug} onChange={set('slug')} />
      </Field>
      <Field label="Content (HTML)" htmlFor="pg_content" className="sm:col-span-2">
        <Textarea id="pg_content" rows={12} value={v.content} onChange={set('content')} className="font-mono text-xs" />
      </Field>
      <Field label="SEO title" htmlFor="pg_meta_title">
        <Input id="pg_meta_title" value={v.meta_title} onChange={set('meta_title')} />
      </Field>
      <Field label="Status" htmlFor="pg_status">
        <Select id="pg_status" value={v.status} onChange={set('status')}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>
      <Field label="SEO description" htmlFor="pg_meta_desc" className="sm:col-span-2">
        <Textarea id="pg_meta_desc" rows={2} value={v.meta_description} onChange={set('meta_description')} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={save.isPending}>
          Save page
        </Button>
      </div>
    </form>
  );
}

function ContentsSection() {
  const [editing, setEditing] = useState(null);
  const query = useQuery({ queryKey: CONTENTS_KEY, queryFn: () => get(EP.admin.cmsContents).then((r) => r.data.contents) });

  return (
    <Card>
      <CardHeader
        title="Content blocks"
        description="Homepage sections such as hero, about and announcements, keyed by section_key"
        action={
          <Button size="sm" variant="secondary" onClick={() => setEditing({})}>
            <Plus className="size-4" aria-hidden /> New block
          </Button>
        }
      />
      <QueryState query={query} loading={<Loader />}>
        {(contents) => (
          <DataTable
            rows={contents}
            empty="No content blocks yet."
            onRowClick={(c) => setEditing(c)}
            columns={[
              { key: 'section_key', header: 'Key', render: (c) => <span className="font-mono text-xs">{c.section_key}</span> },
              { key: 'title', header: 'Title' },
              { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
              { key: 'updated_at', header: 'Updated', render: (c) => formatDate(c.updated_at) }
            ]}
          />
        )}
      </QueryState>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.section_key ? `Edit ${editing.section_key}` : 'New content block'} size="lg">
        {editing && <ContentForm block={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </Card>
  );
}

function ContentForm({ block, onDone }) {
  const ask = useConfirm();
  const [v, setV] = useState({
    section_key: block.section_key || '',
    title: block.title || '',
    content: typeof block.content === 'object' && block.content !== null ? JSON.stringify(block.content, null, 2) : block.content || '',
    status: block.status || 'active'
  });
  const [image, setImage] = useState(null);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const save = useApiMutation(
    () => {
      const fd = new FormData();
      fd.append('title', v.title);
      fd.append('content', v.content);
      fd.append('status', v.status);
      if (image) fd.append('image', image);
      return upload(EP.admin.cmsContent(v.section_key), fd, { method: 'put' });
    },
    { invalidate: [CONTENTS_KEY], onSuccess: onDone }
  );
  const remove = useApiMutation(() => del(EP.admin.cmsContent(block.section_key)), { invalidate: [CONTENTS_KEY], onSuccess: onDone });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Section key" htmlFor="ct_key" required hint="e.g. home_hero, home_about">
        <Input id="ct_key" value={v.section_key} onChange={set('section_key')} disabled={Boolean(block.section_key)} pattern="[a-z0-9_\-]+" required />
      </Field>
      <Field label="Title" htmlFor="ct_title">
        <Input id="ct_title" value={v.title} onChange={set('title')} />
      </Field>
      <Field label="Content" htmlFor="ct_content" hint="Text, HTML or JSON">
        <Textarea id="ct_content" rows={8} value={v.content} onChange={set('content')} className="font-mono text-xs" />
      </Field>
      <Field label="Image" htmlFor="ct_image">
        <Input id="ct_image" type="file" accept="image/*" className="pt-2" onChange={(e) => setImage(e.target.files?.[0] || null)} />
      </Field>
      <Field label="Status" htmlFor="ct_status">
        <Select id="ct_status" value={v.status} onChange={set('status')}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={save.isPending} disabled={!v.section_key}>
          Save block
        </Button>
        {block.section_key && (
          <Button type="button" variant="ghost" onClick={async () => (await ask({ title: 'Delete block?', message: 'This content block will be deleted.', confirmLabel: 'Delete' })) && remove.mutate()}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
