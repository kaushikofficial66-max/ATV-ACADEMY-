import { SITE_URL } from '@/lib/config';

/** /robots.txt - index the public site, keep panels and auth screens out. */
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/student', '/tutor', '/admin', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email'] }],
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
