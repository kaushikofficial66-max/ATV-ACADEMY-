import { notFound } from 'next/navigation';
import { Star, Users, PlayCircle, Clock, BarChart3, Award, Video, FolderUp } from 'lucide-react';
import { serverGet } from '@/lib/api/server';
import { EP } from '@/lib/api/endpoints';
import { assetUrl, formatDuration, formatPrice, fullName, humanize } from '@/lib/utils';
import { SITE_URL } from '@/lib/config';
import CourseActions from '@/features/courses/CourseActions';

export const revalidate = 60;

const getCourse = (slug) => serverGet(EP.public.course(slug), { revalidate: 60 });

/** Per-course SEO: title, description, canonical URL and social preview image. */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getCourse(slug);
  if (!data?.course) return { title: 'Course not found', robots: { index: false } };
  const { course } = data;
  const description = course.short_description || `Learn ${course.title} online with recorded lessons, live classes and a certificate.`;
  const image = assetUrl(course.thumbnail_url);
  return {
    title: course.title,
    description,
    alternates: { canonical: `/courses/${course.slug}` },
    openGraph: { title: course.title, description, url: `/courses/${course.slug}`, ...(image && { images: [{ url: image }] }) }
  };
}

export default async function CoursePage({ params }) {
  const { slug } = await params;
  const data = await getCourse(slug);
  if (!data?.course) notFound();
  const { course, includes, rating_breakdown: ratings } = data;
  const thumb = assetUrl(course.thumbnail_url);

  // Structured data so Google can show a rich result for the course.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.title,
    description: course.short_description || course.title,
    url: `${SITE_URL}/courses/${course.slug}`,
    provider: { '@type': 'Organization', name: process.env.NEXT_PUBLIC_SITE_NAME || 'ATV Academy', sameAs: SITE_URL },
    ...(course.review_count > 0 && { aggregateRating: { '@type': 'AggregateRating', ratingValue: course.average_rating, reviewCount: course.review_count } }),
    offers: { '@type': 'Offer', price: course.effective_price, priceCurrency: 'INR', category: Number(course.effective_price) === 0 ? 'Free' : 'Paid' }
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <section className="bg-slate-900 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {course.category?.name && <p className="text-sm font-medium uppercase tracking-wide text-brand-300">{course.category.name}</p>}
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{course.title}</h1>
            {course.short_description && <p className="mt-4 text-lg text-slate-300">{course.short_description}</p>}
            <div className="mt-5 flex flex-wrap gap-5 text-sm text-slate-300">
              {course.review_count > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="size-4 fill-amber-400 text-amber-400" /> {course.average_rating} ({course.review_count} reviews)
                </span>
              )}
              <span className="flex items-center gap-1"><Users className="size-4" /> {course.student_count} students</span>
              <span className="flex items-center gap-1"><PlayCircle className="size-4" /> {course.lecture_count} lectures</span>
              <span className="flex items-center gap-1"><Clock className="size-4" /> {formatDuration(course.total_duration_seconds)}</span>
              <span className="flex items-center gap-1"><BarChart3 className="size-4" /> {humanize(course.level)}</span>
            </div>
            {course.tutors?.length > 0 && <p className="mt-4 text-sm text-slate-300">Taught by {course.tutors.map(fullName).join(', ')}</p>}
          </div>
          <aside className="rounded-xl bg-white p-5 text-slate-900 shadow-lg">
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt={course.title} className="mb-4 aspect-video w-full rounded-lg object-cover" />
            )}
            <p className="text-3xl font-bold">{formatPrice(course.effective_price)}</p>
            {course.discount_price != null && Number(course.discount_price) < Number(course.price) && <p className="text-sm text-slate-400 line-through">{formatPrice(course.price)}</p>}
            <CourseActions courseId={course.id} slug={course.slug} price={course.effective_price} />
            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              {includes?.recorded_videos > 0 && <li className="flex items-center gap-2"><Video className="size-4" /> {includes.recorded_videos} recorded videos</li>}
              {includes?.upcoming_live_classes > 0 && <li className="flex items-center gap-2"><Video className="size-4" /> {includes.upcoming_live_classes} upcoming live classes</li>}
              {includes?.final_project && <li className="flex items-center gap-2"><FolderUp className="size-4" /> Final project with tutor review</li>}
              <li className="flex items-center gap-2"><Award className="size-4" /> Certificate of completion</li>
              <li className="flex items-center gap-2"><Users className="size-4" /> Lifetime community access</li>
            </ul>
          </aside>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          {course.description && (
            <section>
              <h2 className="mb-4 text-2xl font-bold text-slate-900">About this course</h2>
              <div className="prose-content whitespace-pre-line text-slate-700">{course.description}</div>
            </section>
          )}
          <section>
            <h2 className="mb-4 text-2xl font-bold text-slate-900">Curriculum</h2>
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
              {(course.sections || []).map((section) => (
                <details key={section.id} className="group p-4" open>
                  <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-900">
                    {section.title}
                    <span className="text-sm font-normal text-slate-500">{section.lectures?.length || 0} lectures</span>
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {(section.lectures || []).map((lecture) => (
                      <li key={lecture.id} className="flex items-center justify-between text-sm text-slate-600">
                        <span className="flex items-center gap-2">
                          <PlayCircle className="size-4 text-slate-400" />
                          {lecture.title}
                          {lecture.is_preview && <span className="rounded bg-green-50 px-1.5 text-xs text-green-700">Preview</span>}
                        </span>
                        <span>{formatDuration(lecture.duration_seconds)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>
        </div>
        <aside className="space-y-6">
          {ratings?.some((r) => r.count > 0) && (
            <section className="rounded-xl border border-slate-200 p-5">
              <h2 className="mb-3 font-semibold text-slate-900">Ratings</h2>
              {ratings.map((r) => (
                <div key={r.rating} className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="w-6">{r.rating}★</span>
                  <span className="h-2 flex-1 rounded bg-slate-100">
                    <span className="block h-2 rounded bg-amber-400" style={{ width: `${(r.count / Math.max(1, course.review_count)) * 100}%` }} />
                  </span>
                  <span className="w-6 text-right">{r.count}</span>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
