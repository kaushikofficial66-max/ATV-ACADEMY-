'use client';

import { useForm } from 'react-hook-form';
import { post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { Button, Card, CardHeader, Field, Input, PageHeader, Select } from '@/components/ui';
import { useApiMutation } from '@/hooks/useApiMutation';

/** Create student / tutor / admin accounts. Lists live under Students and Tutors. */
export default function AdminUsersPage() {
  const { register, handleSubmit, reset } = useForm({ defaultValues: { first_name: '', last_name: '', email: '', phone: '', role: 'student', password: '', status: 'active' } });
  const create = useApiMutation((body) => post(EP.admin.users, { ...body, password: body.password || undefined, phone: body.phone || undefined }), {
    invalidate: [['admin', 'students'], ['admin', 'tutors']],
    onSuccess: () => reset()
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Create accounts for students, tutors and other admins"
        actions={
          <>
            <Button href="/admin/students" variant="secondary">Students</Button>
            <Button href="/admin/tutors" variant="secondary">Tutors</Button>
          </>
        }
      />
      <Card className="max-w-2xl">
        <CardHeader title="New user" description="Leave the password empty to email the user a link to set their own." />
        <form onSubmit={handleSubmit((v) => create.mutate(v))} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="First name" htmlFor="first_name" required>
            <Input id="first_name" {...register('first_name', { required: true })} />
          </Field>
          <Field label="Last name" htmlFor="last_name">
            <Input id="last_name" {...register('last_name')} />
          </Field>
          <Field label="Email" htmlFor="email" required>
            <Input id="email" type="email" {...register('email', { required: true })} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" type="tel" {...register('phone')} />
          </Field>
          <Field label="Role" htmlFor="role">
            <Select id="role" {...register('role')}>
              <option value="student">Student</option>
              <option value="tutor">Tutor</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" {...register('status')}>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <Field label="Password" htmlFor="password" hint="Optional, min 8 characters" className="sm:col-span-2">
            <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" loading={create.isPending}>
              Create user
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
