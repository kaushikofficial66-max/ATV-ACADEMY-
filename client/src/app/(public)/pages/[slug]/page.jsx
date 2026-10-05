import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/api/server';
import { EP } from '@/lib/api/endpoints';

export const revalidate = 300;

const getPage = (slug) => serverGet(EP.public.page(slug), { revalidate: 300 });

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getPage(slug);
  if (!data?.page) return { title: 'Page not found', robots: { index: false } };
  return {
    title: data.page.meta_title || data.page.title,
    description: data.page.meta_description || undefined,
    alternates: { canonical: `/pages/${slug}` }
  };
}

/**
 * Static CMS page (About, Terms, Privacy...). The HTML is written by admins in
 * Admin > Website (CMS); render only content you trust.
 */
export default async function StaticPage({ params }) {
  const { slug } = await params;
  const data = await getPage(slug);
  if (!data?.page) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-8 text-4xl font-bold text-slate-900">{data.page.title}</h1>
      <div className="prose-content text-slate-700" dangerouslySetInnerHTML={{ __html: data.page.content || '' }} />
    </article>
  );
}
