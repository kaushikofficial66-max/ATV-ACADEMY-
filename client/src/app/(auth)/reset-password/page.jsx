import { Suspense } from 'react';
import { ResetPasswordForm } from '@/features/auth/PasswordForms';

export const metadata = { title: 'Reset password' };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
