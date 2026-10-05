import Link from 'next/link';
import { Star, Users, PlayCircle } from 'lucide-react';
import { assetUrl, formatPrice, fullName } from '@/lib/utils';

/** Course tile for the catalog / homepage (server-renderable). */
export default function CourseCard({ course }) {
  const thumb = assetUrl(course.thumbnail_url);
  const price = course.effective_price ?? course.discount_price ?? course.price;
  const hasDiscount = course.discount_price != null && Number(course.discount_price) < Number(course.price);
  const tutors = (course.tutors || []).map(fullName).join(', ');

  return (
    <Link href={`/courses/${course.slug}`} className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="aspect-video bg-gradient-to-br from-brand-100 to-brand-200">
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {course.category?.name && <span className="text-xs font-medium uppercase tracking-wide text-brand-700">{course.category.name}</span>}
        <h3 className="line-clamp-2 font-semibold text-slate-900 group-hover:text-brand-800">{course.title}</h3>
        {tutors && <p className="truncate text-sm text-slate-500">{tutors}</p>}
        <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-slate-500">
          {course.review_count > 0 && (
            <span className="flex items-center gap-1">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {course.average_rating} ({course.review_count})
            </span>
          )}
          {course.student_count > 0 && (
            <span className="flex items-center gap-1">
              <Users className="size-3.5" />
              {course.student_count}
            </span>
          )}
          {course.lecture_count > 0 && (
            <span className="flex items-center gap-1">
              <PlayCircle className="size-3.5" />
              {course.lecture_count} lectures
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-slate-900">{formatPrice(price)}</span>
          {hasDiscount && <span className="text-sm text-slate-400 line-through">{formatPrice(course.price)}</span>}
        </div>
      </div>
    </Link>
  );
}

export function CourseGrid({ courses = [] }) {
  if (!courses.length) return <p className="py-10 text-center text-slate-500">No courses found.</p>;
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {courses.map((c) => (
        <CourseCard key={c.id} course={c} />
      ))}
    </div>
  );
}
