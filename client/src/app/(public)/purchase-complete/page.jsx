import { Suspense } from 'react';
import PurchaseComplete from '@/features/commerce/PurchaseComplete';

export const metadata = { title: 'Purchase complete', robots: { index: false } };

/** Return page for the WooCommerce thank-you page: /purchase-complete?order=<order id>. */
export default function PurchaseCompletePage() {
  return (
    <Suspense>
      <PurchaseComplete />
    </Suspense>
  );
}
