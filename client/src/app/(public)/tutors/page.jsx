import Link from 'next/link';
import { serverGet } from '@/lib/api/server';
import { EP } from '@/lib/api/endpoints';
import { assetUrl, fullName } from '@/lib/utils';

export const revalidate = 300;

export const metadata = { title: 'Our tutors', description: 'Meet the tutors teaching on our platform.', alternates: { canonical: '/tutors' } };

export default async function TutorsPage() {
  const data = await serverGet(EP.public.tutors, { params: { limit: 48 }, revalidate: 300 });
  const tutors = data?.tutors || [];
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-slate-900">Our tutors</h1>
      {tutors.length === 0 ? (
        <p className="mt-6 text-slate-500">No tutors to show yet.</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {tutors.map((t) => (
            <Link key={t.id} href={`/tutors/${t.id}`} className="rounded-xl border border-slate-200 p-5 text-center transition hover:shadow-md">
              {t.profile_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(t.profile_image)} alt="" className="mx-auto size-20 rounded-full object-cover" />
              ) : (
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-brand-100 text-2xl font-semibold text-brand-800">{t.first_name?.[0]}</div>
              )}
              <p className="mt-3 font-semibold text-slate-900">{fullName(t)}</p>
              <p className="text-sm text-slate-500">
                {t.course_count} courses · {t.student_count} students
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
