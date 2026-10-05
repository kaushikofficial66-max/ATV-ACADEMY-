'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Award, Download, ExternalLink } from 'lucide-react';
import { get, downloadFile } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, PageHeader, StatusBadge } from '@/components/ui';
import { QueryState, EmptyState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { formatDate } from '@/lib/utils';

export default function StudentCertificatesPage() {
  const query = useQuery({ queryKey: ['student', 'certificates'], queryFn: () => get(EP.student.certificates).then((r) => r.data.certificates) });
  return (
    <>
      <PageHeader title="Certificates" description="Issued when your final project is approved and the course reaches 100%." />
      <QueryState query={query} loading={<Loader />}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <EmptyState icon={Award} title="No certificates yet" description="Complete a course to earn your first certificate." />
            </Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((c) => (
                <Card key={c.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <Award className="size-8 text-brand-700" aria-hidden />
                    <StatusBadge status={c.status} label={c.status_label} />
                  </div>
                  <p className="mt-3 font-semibold text-slate-900">{c.course?.title}</p>
                  {c.certificate_number && <p className="mt-1 font-mono text-xs text-slate-500">{c.certificate_number}</p>}
                  {c.issued_at && <p className="text-xs text-slate-500">Issued {formatDate(c.issued_at)}</p>}
                  {c.is_downloadable && (
                    <div className="mt-auto flex gap-2 pt-4">
                      <Button size="sm" onClick={() => downloadFile(EP.student.certificateDownload(c.id), `${c.certificate_number || 'certificate'}.pdf`)}>
                        <Download className="size-4" aria-hidden /> Download PDF
                      </Button>
                      <Link href={`/certificates/verify/${c.certificate_number}`} target="_blank" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
                        Verify <ExternalLink className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )
        }
      </QueryState>
    </>
  );
}
