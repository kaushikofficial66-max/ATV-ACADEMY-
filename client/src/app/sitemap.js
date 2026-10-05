import { serverGet } from '@/lib/api/server';
import { EP } from '@/lib/api/endpoints';
import { SITE_URL } from '@/lib/config';

export const revalidate = 3600;

/** /sitemap.xml - static routes + every published course, tutor and CMS page. */
export default async function sitemap() {
  const [courses, tutors, pages] = await Promise.all([
    serverGet(EP.public.courses, { params: { limit: 100 }, revalidate: 3600 }),
    serverGet(EP.public.tutors, { params: { limit: 100 }, revalidate: 3600 }),
    serverGet(EP.public.pages, { revalidate: 3600 })
  ]);
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/courses`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/tutors`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    ...(courses?.courses || []).map((c) => ({ url: `${SITE_URL}/courses/${c.slug}`, lastModified: c.published_at ? new Date(c.published_at) : now, changeFrequency: 'weekly', priority: 0.8 })),
    ...(tutors?.tutors || []).map((t) => ({ url: `${SITE_URL}/tutors/${t.id}`, changeFrequency: 'monthly', priority: 0.5 })),
    ...(pages?.pages || []).map((p) => ({ url: `${SITE_URL}/pages/${p.slug}`, changeFrequency: 'monthly', priority: 0.4 }))
  ];
}
