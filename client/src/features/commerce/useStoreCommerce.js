'use client';

import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';

/**
 * Commerce mode from the public site settings. When WooCommerce is enabled,
 * paid courses are bought on the store (antarikshtv.com) and the LMS cart,
 * coupons and checkout are not used.
 */
export function useStoreCommerce() {
  const query = useQuery({
    queryKey: ['public', 'settings'],
    queryFn: () => get(EP.public.settings).then((r) => r.data.settings),
    staleTime: 5 * 60 * 1000
  });
  const settings = query.data || {};
  return {
    enabled: settings.woocommerce_enabled === true || settings.woocommerce_enabled === 'true',
    storeUrl: settings.woocommerce_url || '',
    isLoading: query.isLoading
  };
}

/** "antarikshtv.com" from "https://www.antarikshtv.com". */
export const storeName = (storeUrl) => {
  try {
    return new URL(storeUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'our store';
  }
};
