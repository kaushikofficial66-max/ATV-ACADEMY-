'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button, Field, Input } from '@/components/ui';
import { useAuth } from './AuthProvider';
import { loginSchema } from './schemas';
import { getErrorMessage } from '@/lib/api/client';
import { ROLE_HOME } from '@/config/constants';

/**
 * Only follow ?next= when it is a path on this site that the user may open:
 * public pages, or their own panel (never another role's panel / other sites).
 */
const safeNext = (next, role) => {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  const otherPanel = Object.entries(ROLE_HOME).some(([r, home]) => r !== role && (next === home || next.startsWith(`${home}/`)));
  return otherPanel ? null : next;
};

export default function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = async ({ email, password }) => {
    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.first_name}!`);
      router.replace(safeNext(params.get('next'), user.role_name) || ROLE_HOME[user.role_name] || '/');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Login failed.'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Log in</h1>
        <p className="mt-1 text-sm text-slate-500">Students, tutors and admins all sign in here.</p>
      </div>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" invalid={!!errors.password} {...register('password')} />
      </Field>
      <div className="text-right">
        <Link href="/forgot-password" className="text-sm text-brand-700 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Log in
      </Button>
      <p className="text-center text-sm text-slate-500">
        New here?{' '}
        <Link href="/register" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
