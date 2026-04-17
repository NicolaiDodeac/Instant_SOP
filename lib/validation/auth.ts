import { z } from 'zod'

/** Shared with POST `/api/auth/signin` and the login page (client). */
export const authSignInBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email')
    .transform((s) => s.toLowerCase()),
  password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
})

/** Shared with POST `/api/auth/signup` and the login page (client). */
export const authSignUpBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email')
    .transform((s) => s.toLowerCase()),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password must be 128 characters or fewer'),
})

export type AuthSignInBody = z.infer<typeof authSignInBodySchema>
export type AuthSignUpBody = z.infer<typeof authSignUpBodySchema>
