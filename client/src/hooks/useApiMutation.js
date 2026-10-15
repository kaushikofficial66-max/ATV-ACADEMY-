'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { getErrorMessage } from '@/lib/api/client';

/**
 * useMutation with the app's defaults: success toast (API message or
 * `success`), error toast, and invalidation of the given query key prefixes.
 *
 *   const save = useApiMutation((body) => post(url, body), { invalidate: [['admin', 'coupons']] });
 */
export function useApiMutation(mutationFn, { success, invalidate = [], onSuccess, silent = false } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (res, vars) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (!silent) toast.success(success || res?.message || 'Saved');
      onSuccess?.(res, vars);
    },
    onError: (error) => toast.error(getErrorMessage(error))
  });
}

export default useApiMutation;
