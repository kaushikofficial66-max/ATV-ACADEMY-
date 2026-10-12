import { SITE_URL } from '@/lib/config';

/** /robots.txt - the portal is private: only the legal pages and certificate verification may be indexed. */
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: ['/pages/', '/certificates/verify/'], disallow: ['/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
