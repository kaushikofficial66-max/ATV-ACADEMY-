'use client';

import { post, downloadFile } from '@/lib/api/client';
import { EP, manage } from '@/lib/api/endpoints';
import { Button, PageHeader, StatusBadge } from '@/components/ui';
import ResourceList from '@/components/data/ResourceList';
import { useApiMutation } from '@/hooks/useApiMutation';
import { builderKeys } from '@/features/course-builder/keys';
import { formatDate, fullName } from '@/lib/utils';

/** Certificates for tutor's courses (or all, for admins): approve, download, revoke. */
export default function CertificatesManage({ role }) {
  const m = manage(role);
  const key = builderKeys.certificates(role);
  const approve = useApiMutation((id) => post(m.certificateApprove(id)), { invalidate: [key] });
  const revoke = useApiMutation((id) => post(EP.admin.certificateRevoke(id), { reason: prompt('Reason for revoking?') || undefined }), { invalidate: [key] });

  return (
    <>
      <PageHeader title="Certificates" />
      <ResourceList
        queryKey={key}
        endpoint={m.certificates}
        dataKey="certificates"
        searchPlaceholder="Certificate number..."
        filters={[{ name: 'status', label: 'Status', options: ['pending', 'approved', 'issued', 'revoked'] }]}
        empty="No certificates yet."
        columns={[
          { key: 'student', header: 'Student', render: (c) => fullName(c.student) },
          { key: 'course', header: 'Course', render: (c) => c.course?.title },
          { key: 'certificate_number', header: 'Number', render: (c) => <span className="font-mono text-xs">{c.certificate_number || '-'}</span> },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          { key: 'issued_at', header: 'Issued', render: (c) => (c.issued_at ? formatDate(c.issued_at) : '-') },
          {
            key: 'actions',
            header: '',
            render: (c) => (
              <div className="flex justify-end gap-2">
                {c.status === 'pending' && (
                  <Button size="sm" loading={approve.isPending && approve.variables === c.id} onClick={() => approve.mutate(c.id)}>
                    Approve & issue
                  </Button>
                )}
                {['approved', 'issued'].includes(c.status) && (
                  <Button size="sm" variant="ghost" onClick={() => downloadFile(`${m.certificates}/${c.id}/download`, `${c.certificate_number}.pdf`)}>
                    PDF
                  </Button>
                )}
                {role === 'admin' && ['approved', 'issued'].includes(c.status) && (
                  <Button size="sm" variant="ghost" onClick={() => confirm('Revoke this certificate?') && revoke.mutate(c.id)}>
                    Revoke
                  </Button>
                )}
              </div>
            )
          }
        ]}
      />
    </>
  );
}
