'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-toastify';
import { Button, Field, Input } from '@/components/ui';
import { authApi } from './api';
import { forgotPasswordSchema, resetPasswordSchema } from './schemas';
import { getErrorMessage } from '@/lib/api/client';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const onSubmit = async ({ email }) => {
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  if (sent) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Check your email</h1>
        <p className="text-sm text-slate-600">If that email is registered, we sent a link to reset your password. It is valid for 1 hour.</p>
        <Link href="/login" className="text-sm font-medium text-brand-700 hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Forgot password</h1>
        <p className="mt-1 text-sm text-slate-500">Enter your email and we will send you a reset link.</p>
      </div>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Send reset link
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-brand-700 hover:underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}

/** Opened from the reset email: /reset-password?token=... */
export function ResetPasswordForm() {
  const token = useSearchParams().get('token');
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm({ resolver: zodResolver(resetPasswordSchema), defaultValues: { new_password: '', confirm_password: '' } });

  if (!token) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Invalid reset link</h1>
        <p className="text-sm text-slate-600">The link is missing its token. Request a new one.</p>
        <Button href="/forgot-password" variant="secondary">Request new link</Button>
      </div>
    );
  }

  const onSubmit = async ({ new_password }) => {
    try {
      const res = await authApi.resetPassword(token, new_password);
      toast.success(res.message);
      router.replace('/login');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Set a new password</h1>
        <p className="mt-1 text-sm text-slate-500">At least 8 characters with a letter and a number.</p>
      </div>
      <Field label="New password" htmlFor="new_password" error={errors.new_password?.message}>
        <Input id="new_password" type="password" autoComplete="new-password" invalid={!!errors.new_password} {...register('new_password')} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm_password" error={errors.confirm_password?.message}>
        <Input id="confirm_password" type="password" autoComplete="new-password" invalid={!!errors.confirm_password} {...register('confirm_password')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Reset password
      </Button>
    </form>
  );
}
