import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SIGNUP_EMAIL_EXISTS_CODE } from '@/lib/auth/signup-errors'
import { createClientServer } from '@/lib/supabase/server'

const ALLOWED_DOMAIN = 'magna.co.uk'

const signupBodySchema = z.object({
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

/**
 * Server-side sign-up to avoid client "Failed to fetch" errors.
 * Only @magna.co.uk accounts can sign up.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = signupBodySchema.safeParse(body)
    if (!parsed.success) {
      const flat = parsed.error.flatten()
      const message =
        flat.fieldErrors.email?.[0] ??
        flat.fieldErrors.password?.[0] ??
        'Invalid request'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { email: emailLower, password } = parsed.data

    if (!emailLower.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return NextResponse.json(
        { error: `Only @${ALLOWED_DOMAIN} accounts can sign up.` },
        { status: 403 }
      )
    }

    const supabase = await createClientServer()
    const { data, error } = await supabase.auth.signUp({
      email: emailLower,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/dashboard`,
      },
    })

    if (error) {
      const lower = error.message.toLowerCase()
      if (
        lower.includes('already registered') ||
        lower.includes('already been registered') ||
        lower.includes('user already exists') ||
        lower.includes('email address is already')
      ) {
        return NextResponse.json(
          {
            error: 'An account with this email already exists.',
            code: SIGNUP_EMAIL_EXISTS_CODE,
          },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // With email confirmation enabled, GoTrue returns a user with no identities for duplicate emails.
    if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
      return NextResponse.json(
        {
          error: 'An account with this email already exists.',
          code: SIGNUP_EMAIL_EXISTS_CODE,
        },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Check your email to confirm your account',
      user: data.user,
    })
  } catch (err) {
    console.error('Sign-up error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}

