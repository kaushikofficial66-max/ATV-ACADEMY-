import { CircleCheck, TriangleAlert } from 'lucide-react';
import { serverGet } from '@/lib/api/server';
import { EP } from '@/lib/api/endpoints';
import { formatDate } from '@/lib/utils';

export const metadata = { title: 'Verify certificate', robots: { index: false } };

/** Public certificate check (the link printed on every certificate PDF). */
export default async function VerifyCertificatePage({ params }) {
  const { number } = await params;
  const data = await serverGet(EP.public.verifyCertificate(number), { revalidate: 60 });
  const cert = data?.certificate;
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      {cert ? (
        <>
          <CircleCheck className="mx-auto size-14 text-green-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Valid certificate</h1>
          <dl className="mt-6 space-y-3 rounded-xl border border-slate-200 p-6 text-left text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Awarded to</dt><dd className="font-medium">{cert.student_name}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Course</dt><dd className="font-medium">{cert.course?.title}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Issued</dt><dd>{formatDate(cert.issue_date)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Certificate no.</dt><dd className="font-mono">{cert.certificate_number}</dd></div>
            {cert.approved_by && <div className="flex justify-between gap-4"><dt className="text-slate-500">Approved by</dt><dd>{cert.approved_by}</dd></div>}
          </dl>
        </>
      ) : (
        <>
          <TriangleAlert className="mx-auto size-14 text-amber-500" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Certificate not found</h1>
          <p className="mt-2 text-slate-600">No valid certificate exists with number {number}. It may have been revoked.</p>
        </>
      )}
    </div>
  );
}
