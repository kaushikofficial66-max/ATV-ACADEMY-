import { z } from 'zod';

// Mirrors the API's validation (routes/validators.js).
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.')
  .regex(/[A-Za-z]/, 'Password must contain a letter.')
  .regex(/\d/, 'Password must contain a number.');

export const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.')
});

export const registerSchema = z
  .object({
    first_name: z.string().trim().min(1, 'First name is required.').max(100),
    last_name: z.string().trim().max(100).optional(),
    email: z.email('Enter a valid email address.'),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s-]{7,20}$/, 'Enter a valid phone number.')
      .optional()
      .or(z.literal('')),
    role: z.enum(['student', 'tutor']),
    password,
    confirm_password: z.string()
  })
  .refine((v) => v.password === v.confirm_password, { message: 'Passwords do not match.', path: ['confirm_password'] });

export const forgotPasswordSchema = z.object({ email: z.email('Enter a valid email address.') });

export const resetPasswordSchema = z
  .object({ new_password: password, confirm_password: z.string() })
  .refine((v) => v.new_password === v.confirm_password, { message: 'Passwords do not match.', path: ['confirm_password'] });

export const changePasswordSchema = z
  .object({ current_password: z.string().min(1, 'Current password is required.'), new_password: password, confirm_password: z.string() })
  .refine((v) => v.new_password === v.confirm_password, { message: 'Passwords do not match.', path: ['confirm_password'] });
