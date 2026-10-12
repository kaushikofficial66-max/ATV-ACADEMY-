'use client';

import { ExternalLink, RefreshCw, Store } from 'lucide-react';
import { post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Badge, Button } from '@/components/ui';
import { useApiMutation } from '@/hooks/useApiMutation';
import { formatDateTime } from '@/lib/utils';
import { builderKeys } from './keys';

const STATUS = {
  publish: { label: 'Published - on sale', tone: 'green' },
  draft: { label: 'Draft - not on sale yet', tone: 'amber' },
  pending: { label: 'Pending review', tone: 'amber' },
  private: { label: 'Private - not on sale', tone: 'gray' },
  trash: { label: 'Deleted on the store', tone: 'red' },
  missing: { label: 'Not found on the store', tone: 'red' }
};

/**
 * Admin view of the WooCommerce product behind a course: status, last sync,
 * errors, links to edit it in WordPress, and create / sync actions.
 * WooCommerce owns the product; the LMS only creates it once and reads it back.
 */
export default function StoreProductPanel({ course, storeUrl, role }) {
  const invalidate = [builderKeys.all(role)];
  const create = useApiMutation(() => post(EP.admin.courseStoreProduct(course.id)), { invalidate });
  const sync = useApiMutation(() => post(EP.admin.wooSyncProducts, { course_ids: [course.id] }), { invalidate });
  const productId = course.woocommerce_product_id;
  const status = STATUS[course.woocommerce_product_status];

  return (
    <div className="border-t border-slate-100 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-sm">
          <p className="flex items-center gap-2 font-medium text-slate-900">
            <Store className="size-4 text-slate-500" aria-hidden /> Store product (WooCommerce)
          </p>
          {productId ? (
            <>
              <p className="flex flex-wrap items-center gap-2 text-slate-600">
                Product #{productId} {status && <Badge tone={status.tone}>{status.label}</Badge>}
              </p>
              <p className="text-xs text-slate-500">
                Price, sale price and publishing are managed in WordPress and synced here
                {course.woocommerce_synced_at ? ` (last synced ${formatDateTime(course.woocommerce_synced_at)})` : ''}.
              </p>
            </>
          ) : (
            <p className="text-slate-600">Not linked. Paid courses get a draft product automatically when saved.</p>
          )}
          {course.woocommerce_sync_error && <p className="text-xs text-red-600">{course.woocommerce_sync_error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {productId ? (
            <>
              {storeUrl && (
                <Button size="sm" variant="secondary" href={`${storeUrl}/wp-admin/post.php?post=${productId}&action=edit`} target="_blank" rel="noopener noreferrer">
                  Edit in WordPress <ExternalLink className="size-3.5" aria-hidden />
                </Button>
              )}
              {course.woocommerce_product_url && course.woocommerce_product_status === 'publish' && (
                <Button size="sm" variant="ghost" href={course.woocommerce_product_url} target="_blank" rel="noopener noreferrer">
                  View on store <ExternalLink className="size-3.5" aria-hidden />
                </Button>
              )}
              <Button size="sm" variant="ghost" loading={sync.isPending} onClick={() => sync.mutate()}>
                <RefreshCw className="size-3.5" aria-hidden /> Sync now
              </Button>
            </>
          ) : (
            <Button size="sm" loading={create.isPending} onClick={() => create.mutate()}>
              Create store product
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
