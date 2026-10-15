'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Heart, MessageCircle, Trash2 } from 'lucide-react';
import { get, post, del, upload } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Avatar, Badge, Button, Card, Input, PageHeader, Pagination, Select, Textarea } from '@/components/ui';
import { QueryState, EmptyState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { assetUrl, cn, formatDateTime, fullName } from '@/lib/utils';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const KEY = ['community'];

/** Discussion feed (general + course discussions) for students and tutors. */
export default function CommunityFeed() {
  const [page, setPage] = useState(1);
  const [courseId, setCourseId] = useState('');
  const params = { page, limit: 10, ...(courseId && { course_id: courseId }) };
  const feed = useQuery({ queryKey: [...KEY, 'feed', params], queryFn: () => get(EP.community.feed, params), placeholderData: keepPreviousData });
  const courses = useQuery({ queryKey: [...KEY, 'courses'], queryFn: () => get(EP.community.courses).then((r) => r.data.courses) });

  return (
    <>
      <PageHeader
        title="Community"
        description="Ask questions and discuss with tutors and other learners"
        actions={
          <Select
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setPage(1);
            }}
            aria-label="Discussion"
          >
            <option value="">All discussions</option>
            {courses.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        }
      />
      <div className="mx-auto max-w-3xl space-y-5">
        <Composer courses={courses.data || []} defaultCourseId={courseId} />
        <QueryState query={feed} loading={<Loader />}>
          {({ data, meta }) =>
            data.posts.length === 0 ? (
              <Card>
                <EmptyState title="No posts yet" description="Start the conversation!" />
              </Card>
            ) : (
              <>
                {data.posts.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
                <Card>
                  <Pagination meta={meta} onPageChange={setPage} />
                </Card>
              </>
            )
          }
        </QueryState>
      </div>
    </>
  );
}

function Composer({ courses, defaultCourseId }) {
  const [content, setContent] = useState('');
  const [courseId, setCourseId] = useState(defaultCourseId);
  const [file, setFile] = useState(null);
  const create = useApiMutation(
    () => {
      const fd = new FormData();
      fd.append('content', content);
      if (courseId) fd.append('course_id', courseId);
      if (file) fd.append('attachment', file);
      return upload(EP.community.posts, fd);
    },
    {
      invalidate: [KEY],
      onSuccess: () => {
        setContent('');
        setFile(null);
      }
    }
  );

  return (
    <Card className="space-y-3 p-4">
      <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Share something or ask a question..." aria-label="New post" />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-auto" aria-label="Post to">
          <option value="">General discussion</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
        <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-auto pt-2" aria-label="Attach image" />
        <Button className="ml-auto" loading={create.isPending} disabled={!content.trim()} onClick={() => create.mutate()}>
          Post
        </Button>
      </div>
    </Card>
  );
}

function PostCard({ post: p }) {
  const ask = useConfirm();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const like = useApiMutation(() => post(EP.community.like(p.id)), { invalidate: [KEY], silent: true });
  const remove = useApiMutation(() => del(EP.community.post(p.id)), { invalidate: [KEY] });
  const addComment = useApiMutation(() => post(EP.community.comments(p.id), { content: comment }), {
    invalidate: [KEY],
    silent: true,
    onSuccess: () => setComment('')
  });
  const comments = useQuery({
    queryKey: [...KEY, 'comments', p.id],
    queryFn: () => get(EP.community.comments(p.id), { limit: 50 }).then((r) => r.data.comments),
    enabled: open
  });
  const shown = open ? comments.data || [] : p.recent_comments || [];

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Avatar user={p.author} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{fullName(p.author)}</span>
            {p.course && <Badge tone="blue">{p.course.title}</Badge>}
            {p.status !== 'published' && <Badge tone="amber">Awaiting moderation</Badge>}
          </div>
          <p className="text-xs text-slate-400">{formatDateTime(p.created_at)}</p>
        </div>
        {p.can_delete && (
          <Button size="sm" variant="ghost" onClick={async () => (await ask({ title: 'Delete post?', message: 'This post will be deleted.', confirmLabel: 'Delete' })) && remove.mutate()} aria-label="Delete post">
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
      <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{p.content}</p>
      {p.attachment_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(p.attachment_url)} alt="" className="mt-3 max-h-96 rounded-lg object-contain" />
      )}
      <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-sm text-slate-500">
        <button type="button" onClick={() => like.mutate()} className={cn('inline-flex items-center gap-1', p.liked_by_me && 'text-red-600')}>
          <Heart className={cn('size-4', p.liked_by_me && 'fill-current')} aria-hidden /> {p.like_count}
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1">
          <MessageCircle className="size-4" aria-hidden /> {p.comment_count}
        </button>
      </div>
      {shown.length > 0 && (
        <ul className="mt-3 space-y-3">
          {shown.map((c) => (
            <li key={c.id} className="flex gap-2">
              <Avatar user={c.author} size={28} />
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{fullName(c.author)}</span>
                <p className="text-slate-700">{c.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {p.status === 'published' && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (comment.trim()) addComment.mutate();
          }}
        >
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment..." aria-label="Comment" />
          <Button type="submit" variant="secondary" loading={addComment.isPending}>
            Reply
          </Button>
        </form>
      )}
    </Card>
  );
}
