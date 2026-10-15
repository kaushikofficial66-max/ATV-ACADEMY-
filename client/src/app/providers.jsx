'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ConfirmProvider } from '@/components/feedback/ConfirmProvider';

/** Client-side providers shared by every page (React Query, auth, confirm dialog, toasts). */
export default function Providers({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: (count, error) => ![401, 403, 404].includes(error?.response?.status) && count < 2,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </AuthProvider>
      <ToastContainer position="top-right" theme="colored" autoClose={4000} limit={3} newestOnTop closeOnClick pauseOnFocusLoss={false} />
    </QueryClientProvider>
  );
}
