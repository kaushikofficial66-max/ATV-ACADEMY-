import Link from 'next/link';
import { serverGet } from '@/lib/api/server';
import { EP } from '@/lib/api/endpoints';
import { CourseGrid } from '@/features/courses/CourseCard';
import { Button } from '@/components/ui';
import { formatNumber } from '@/lib/utils';

export const revalidate = 60;

/** Homepage: CMS blocks + course lists from GET /public/home (cached 60s). */
export default async function HomePage() {
  const home = await serverGet(EP.public.home);
  const hero = home?.contents?.hero;
  const features = home?.contents?.features?.data?.items || [];
  const featured = home?.featured_courses?.length ? home.featured_courses : home?.latest_courses || [];

  return (
    <>
      <section className="bg-gradient-to-br from-brand-800 to-brand-600 text-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">{hero?.title || 'Learn from the best, at your own pace'}</h1>
          <p className="mt-4 max-w-2xl text-lg text-brand-100">
            {hero?.content || 'Recorded lessons, live classes, projects and certificates - all in one place.'}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href={hero?.data?.cta_link || '/courses'} size="lg" className="bg-white text-brand-800 hover:bg-brand-50">
              {hero?.data?.cta_label || 'Browse Courses'}
            </Button>
            <Button href="/register?role=tutor" size="lg" variant="ghost" className="text-white hover:bg-white/10">
              Teach on {process.env.NEXT_PUBLIC_SITE_NAME || 'ATV Academy'}
            </Button>
          </div>
          {home?.stats && (
            <dl className="mt-12 flex flex-wrap gap-10">
              {[
                ['Students', home.stats.students],
                ['Tutors', home.stats.tutors],
                ['Courses', home.stats.courses]
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-brand-200">{label}</dt>
                  <dd className="text-3xl font-bold">{formatNumber(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl font-bold text-slate-900">{home?.featured_courses?.length ? 'Featured courses' : 'Latest courses'}</h2>
          <Link href="/courses" className="text-sm font-medium text-brand-700 hover:underline">
            View all
          </Link>
        </div>
        {home ? <CourseGrid courses={featured} /> : <p className="text-slate-500">Courses will appear here once the API is reachable.</p>}
      </section>

      {home?.popular_courses?.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
          <h2 className="mb-6 text-2xl font-bold text-slate-900">Popular courses</h2>
          <CourseGrid courses={home.popular_courses} />
        </section>
      )}

      {home?.categories?.length > 0 && (
        <section className="bg-slate-50 py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 className="mb-6 text-2xl font-bold text-slate-900">Browse by category</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {home.categories.map((c) => (
                <Link key={c.id} href={`/courses?category=${c.slug}`} className="rounded-xl border border-slate-200 bg-white p-5 transition hover:shadow-md">
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{c.course_count} courses</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {features.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 className="mb-8 text-2xl font-bold text-slate-900">{home.contents.features.title || 'Why learn with us'}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-200 p-5">
                <p className="font-semibold text-slate-900">{f.title}</p>
                <p className="mt-1 text-sm text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
