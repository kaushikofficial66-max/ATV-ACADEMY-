import { serverGet } from '@/lib/api/server';
import { EP } from '@/lib/api/endpoints';
import { SITE_URL } from '@/lib/config';

export const revalidate = 3600;

/** /sitemap.xml - only the public legal / info pages (everything else is behind the login). */
export default async function sitemap() {
  const pages = await serverGet(EP.public.pages, { revalidate: 3600 });
  return (pages?.pages || [])
    .filter((p) => p.slug !== 'about-us')
    .map((p) => ({ url: `${SITE_URL}/pages/${p.slug}`, changeFrequency: 'monthly', priority: 0.4 }));
}
