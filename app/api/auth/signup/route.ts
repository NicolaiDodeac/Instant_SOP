import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { SIGNUP_EMAIL_EXISTS_CODE } from '@/lib/auth/signup-errors'
import { createClientServer } from '@/lib/supabase/server'
import { authSignUpBodySchema } from '@/lib/validation/auth'

const ALLOWED_DOMAIN = 'magna.co.uk'

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
      return apiErrorResponse('Invalid request body', 400, { retryable: false })
    }

    const parsed = authSignUpBodySchema.safeParse(body)
    if (!parsed.success) {
      const flat = parsed.error.flatten()
      const message =
        flat.fieldErrors.email?.[0] ??
        flat.fieldErrors.password?.[0] ??
        'Invalid request'
      return apiErrorResponse(message, 400, { retryable: false })
    }

    const { email: emailLower, password } = parsed.data

    if (!emailLower.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return apiErrorResponse(`Only @${ALLOWED_DOMAIN} accounts can sign up.`, 403, {
        retryable: false,
      })
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
        return apiErrorResponse('An account with this email already exists.', 409, {
          code: SIGNUP_EMAIL_EXISTS_CODE,
          retryable: false,
        })
      }
      return apiErrorResponse(error.message, 400, { retryable: false })
    }

    // With email confirmation enabled, GoTrue returns a user with no identities for duplicate emails.
    if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
      return apiErrorResponse('An account with this email already exists.', 409, {
        code: SIGNUP_EMAIL_EXISTS_CODE,
        retryable: false,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Check your email to confirm your account',
      user: data.user,
    })
  } catch (err) {
    console.error('Sign-up error:', err)
    return apiErrorResponse('An unexpected error occurred. Please try again.', 500)
  }
}

