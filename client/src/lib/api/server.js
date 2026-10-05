import 'server-only';
import { API_URL } from '@/lib/config';

/**
 * Fetch for Server Components (public website, SEO). Uses Next.js fetch
 * caching: pages are regenerated at most every `revalidate` seconds.
 * Returns the response `data` or `null` when the API is unreachable / 404,
 * so pages still render (and builds succeed) if the API is down.
 */
export async function serverGet(path, { params, revalidate = 60, notFoundOk = true } = {}) {
  const qs = params
    ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()}`
    : '';
  try {
    const res = await fetch(`${API_URL}${path}${qs}`, { next: { revalidate } });
    if (res.status === 404 && notFoundOk) return null;
    if (!res.ok) return null;
    const body = await res.json();
    return body.meta ? { ...body.data, meta: body.meta } : body.data;
  } catch {
    return null;
  }
}
