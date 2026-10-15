'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { get, put, del, upload } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Avatar, Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { QueryState } from '@/components/feedback/States';
import { Loader } from '@/components/feedback/Loader';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useAuth } from '@/features/auth/AuthProvider';
import { ROLES } from '@/config/constants';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const PROFILE_FIELDS = ['bio', 'date_of_birth', 'gender', 'address', 'city', 'state', 'country', 'postal_code', 'website', 'linkedin_url'];

/** Profile, photo and password - shared by every panel's /account page. */
export default function AccountPage() {
  const query = useQuery({ queryKey: ['account', 'profile'], queryFn: () => get(EP.account.profile).then((r) => r.data.user) });
  return (
    <>
      <PageHeader title="Account" description="Your profile and security settings" />
      <QueryState query={query} loading={<Loader />}>
        {(user) => (
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              <ProfileForm user={user} />
            </div>
            <div className="space-y-6">
              <PhotoCard user={user} />
              <PasswordCard />
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}

function ProfileForm({ user }) {
  const { refresh } = useAuth();
  const profile = user.profile || {};
  const { register, handleSubmit, formState } = useForm({
    defaultValues: {
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone: user.phone || '',
      ...Object.fromEntries(PROFILE_FIELDS.map((f) => [f, profile[f] ?? '']))
    }
  });
  const save = useApiMutation((body) => put(EP.account.profile, body), { invalidate: [['account']], onSuccess: refresh });
  const isTutor = user.role_name === ROLES.TUTOR;

  return (
    <Card>
      <CardHeader title="Profile" description={user.email} />
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="First name" htmlFor="first_name" required>
          <Input id="first_name" {...register('first_name', { required: true })} />
        </Field>
        <Field label="Last name" htmlFor="last_name">
          <Input id="last_name" {...register('last_name')} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" type="tel" {...register('phone')} />
        </Field>
        <Field label="Date of birth" htmlFor="date_of_birth">
          <Input id="date_of_birth" type="date" {...register('date_of_birth')} />
        </Field>
        <Field label="Gender" htmlFor="gender">
          <Select id="gender" {...register('gender')}>
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" {...register('city')} />
        </Field>
        <Field label="State" htmlFor="state">
          <Input id="state" {...register('state')} />
        </Field>
        <Field label="Country" htmlFor="country">
          <Input id="country" {...register('country')} />
        </Field>
        <Field label="Postal code" htmlFor="postal_code">
          <Input id="postal_code" {...register('postal_code')} />
        </Field>
        <Field label="Address" htmlFor="address" className="sm:col-span-2">
          <Input id="address" {...register('address')} />
        </Field>
        {isTutor && (
          <>
            <Field label="Website" htmlFor="website">
              <Input id="website" type="url" {...register('website')} />
            </Field>
            <Field label="LinkedIn" htmlFor="linkedin_url">
              <Input id="linkedin_url" type="url" {...register('linkedin_url')} />
            </Field>
          </>
        )}
        <Field label="Bio" htmlFor="bio" className="sm:col-span-2">
          <Textarea id="bio" rows={4} {...register('bio')} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={save.isPending} disabled={!formState.isDirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PhotoCard({ user }) {
  const { refresh } = useAuth();
  const opts = { invalidate: [['account']], onSuccess: refresh };
  const uploadPhoto = useApiMutation((file) => {
    const fd = new FormData();
    fd.append('profile_image', file);
    return upload(EP.account.photo, fd, { method: 'put' });
  }, opts);
  const ask = useConfirm();
  const removePhoto = useApiMutation(() => del(EP.account.photo), opts);

  return (
    <Card className="flex items-center gap-4 p-5">
      <Avatar user={user} size={64} />
      <div className="space-y-2">
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {uploadPhoto.isPending ? 'Uploading...' : 'Change photo'}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadPhoto.mutate(e.target.files[0])} />
        </label>
        {user.profile_image && (
          <button type="button" className="block text-xs text-slate-500 hover:text-red-600" onClick={async () => (await ask({ title: 'Remove photo?', message: 'Your profile photo will be removed.', confirmLabel: 'Remove' })) && removePhoto.mutate()}>
            Remove photo
          </button>
        )}
      </div>
    </Card>
  );
}

function PasswordCard() {
  const { register, handleSubmit, reset } = useForm({ defaultValues: { current_password: '', new_password: '', confirm: '' } });
  const [mismatch, setMismatch] = useState(false);
  const save = useApiMutation((body) => put(EP.account.password, body), { onSuccess: () => reset() });

  return (
    <Card>
      <CardHeader title="Change password" />
      <form
        className="space-y-3 p-5"
        onSubmit={handleSubmit(({ current_password, new_password, confirm }) => {
          setMismatch(new_password !== confirm);
          if (new_password === confirm) save.mutate({ current_password, new_password });
        })}
      >
        <Field label="Current password" htmlFor="current_password">
          <Input id="current_password" type="password" autoComplete="current-password" {...register('current_password', { required: true })} />
        </Field>
        <Field label="New password" htmlFor="new_password" hint="At least 8 characters with a letter and a number">
          <Input id="new_password" type="password" autoComplete="new-password" {...register('new_password', { required: true, minLength: 8 })} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" error={mismatch ? 'Passwords do not match' : undefined}>
          <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm', { required: true })} />
        </Field>
        <Button type="submit" loading={save.isPending}>
          Update password
        </Button>
      </form>
    </Card>
  );
}
