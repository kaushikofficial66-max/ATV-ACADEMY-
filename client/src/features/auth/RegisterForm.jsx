'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-toastify';
import { Button, Field, Input, Select } from '@/components/ui';
import { useAuth } from './AuthProvider';
import { registerSchema } from './schemas';
import { getErrorMessage, getFieldErrors } from '@/lib/api/client';
import { ROLE_HOME } from '@/config/constants';

export default function RegisterForm() {
  const { register: signUp } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting }
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { first_name: '', last_name: '', email: '', phone: '', role: params.get('role') === 'tutor' ? 'tutor' : 'student', password: '', confirm_password: '' }
  });

  const onSubmit = async ({ confirm_password: _c, phone, ...values }) => {
    try {
      const res = await signUp({ ...values, ...(phone && { phone }) });
      const user = res.data.user;
      toast.success(res.message);
      if (!res.data.token) router.replace('/login');
      else router.replace(ROLE_HOME[user.role_name] || '/');
    } catch (error) {
      const fields = getFieldErrors(error);
      Object.entries(fields).forEach(([field, message]) => setError(field, { message }));
      toast.error(getErrorMessage(error, 'Registration failed.'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">Learn as a student, or apply to teach as a tutor.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="first_name" error={errors.first_name?.message} required>
          <Input id="first_name" autoComplete="given-name" invalid={!!errors.first_name} {...register('first_name')} />
        </Field>
        <Field label="Last name" htmlFor="last_name" error={errors.last_name?.message}>
          <Input id="last_name" autoComplete="family-name" {...register('last_name')} />
        </Field>
      </div>
      <Field label="Email" htmlFor="email" error={errors.email?.message} required>
        <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
      </Field>
      <Field label="Phone" htmlFor="phone" error={errors.phone?.message} hint="Optional, used for WhatsApp updates.">
        <Input id="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" {...register('phone')} />
      </Field>
      <Field label="I want to" htmlFor="role">
        <Select id="role" {...register('role')}>
          <option value="student">Learn (student)</option>
          <option value="tutor">Teach (tutor - needs admin approval)</option>
        </Select>
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters with a letter and a number." required>
        <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm_password" error={errors.confirm_password?.message} required>
        <Input id="confirm_password" type="password" autoComplete="new-password" invalid={!!errors.confirm_password} {...register('confirm_password')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Create account
      </Button>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
