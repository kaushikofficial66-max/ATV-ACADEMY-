import Link from 'next/link';
import { serverGet } from '@/lib/api/server';
import { EP } from '@/lib/api/endpoints';
import { CourseGrid } from '@/features/courses/CourseCard';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'All courses',
  description: 'Browse online courses with recorded lessons, live classes, projects and certificates.',
  alternates: { canonical: '/courses' }
};

const SORTS = [
  ['newest', 'Newest'],
  ['popular', 'Most popular'],
  ['rating', 'Highest rated'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low']
];

/** Catalog: GET /public/courses with search / category / level / sort / page from the URL. */
export default async function CoursesPage({ searchParams }) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const [result, categories] = await Promise.all([
    serverGet(EP.public.courses, { params: { search: sp.search, category: sp.category, level: sp.level, price: sp.price, sort: sp.sort, page, limit: 12 }, revalidate: 30 }),
    serverGet(EP.public.categories, { revalidate: 300 })
  ]);
  const courses = result?.courses || [];
  const meta = result?.meta;
  const qs = (overrides) => {
    const next = new URLSearchParams(Object.entries({ ...sp, ...overrides }).filter(([, v]) => v));
    return `/courses?${next.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-slate-900">Courses</h1>

      <form className="mt-6 flex flex-wrap gap-3" action="/courses">
        <input name="search" defaultValue={sp.search || ''} placeholder="Search courses..." className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
        <select name="category" defaultValue={sp.category || ''} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">All categories</option>
          {(categories?.categories || []).map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="level" defaultValue={sp.level || ''} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">All levels</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        <select name="sort" defaultValue={sp.sort || 'newest'} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-lg bg-brand-700 px-5 text-sm font-medium text-white hover:bg-brand-800">Search</button>
      </form>

      <div className="mt-8">
        {result ? <CourseGrid courses={courses} /> : <p className="text-slate-500">Could not load courses right now.</p>}
      </div>

      {meta && meta.totalPages > 1 && (
        <nav className="mt-10 flex justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={qs({ page: p })} className={cn('rounded-lg border px-3 py-1.5 text-sm', p === page ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50')}>
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
