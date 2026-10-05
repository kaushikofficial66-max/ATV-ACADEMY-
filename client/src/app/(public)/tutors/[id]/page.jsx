import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/api/server';
import { EP } from '@/lib/api/endpoints';
import { CourseGrid } from '@/features/courses/CourseCard';
import { assetUrl, fullName } from '@/lib/utils';

export const revalidate = 300;

const getTutor = (id) => serverGet(EP.public.tutor(id), { revalidate: 300 });

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await getTutor(id);
  if (!data?.tutor) return { title: 'Tutor not found', robots: { index: false } };
  const name = fullName(data.tutor);
  const description = data.tutor.profile?.bio?.slice(0, 160) || `Courses by ${name}.`;
  return {
    title: name,
    description,
    alternates: { canonical: `/tutors/${id}` },
    openGraph: { title: name, description, ...(data.tutor.profile_image && { images: [{ url: assetUrl(data.tutor.profile_image) }] }) }
  };
}

export default async function TutorProfilePage({ params }) {
  const { id } = await params;
  const data = await getTutor(id);
  if (!data?.tutor) notFound();
  const { tutor, stats, courses } = data;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {tutor.profile_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(tutor.profile_image)} alt="" className="size-28 rounded-full object-cover" />
        ) : (
          <div className="flex size-28 items-center justify-center rounded-full bg-brand-100 text-4xl font-semibold text-brand-800">{tutor.first_name?.[0]}</div>
        )}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{fullName(tutor)}</h1>
          <p className="mt-1 text-slate-500">
            {stats.courses} courses · {stats.students} students · {stats.average_rating ? `${stats.average_rating}★ (${stats.reviews})` : 'No reviews yet'}
          </p>
          {tutor.profile?.linkedin_url && (
            <a href={tutor.profile.linkedin_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-brand-700 hover:underline">
              LinkedIn profile
            </a>
          )}
        </div>
      </div>
      {tutor.profile?.bio && <p className="mt-6 max-w-3xl whitespace-pre-line text-slate-700">{tutor.profile.bio}</p>}
      <h2 className="mb-6 mt-10 text-2xl font-bold text-slate-900">Courses</h2>
      <CourseGrid courses={courses} />
    </div>
  );
}
