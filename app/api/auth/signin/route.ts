import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { createClientServer } from '@/lib/supabase/server'
import { authSignInBodySchema } from '@/lib/validation/auth'

const ALLOWED_DOMAIN = 'magna.co.uk'

/**
 * Server-side sign-in to avoid client "Failed to fetch" errors
 * (CORS, browser extensions, or network issues).
 * Only @magna.co.uk accounts are allowed.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiErrorResponse('Invalid request body', 400, { retryable: false })
    }

    const parsed = authSignInBodySchema.safeParse(body)
    if (!parsed.success) {
      const flat = parsed.error.flatten()
      const message = flat.fieldErrors.email?.[0] ?? flat.fieldErrors.password?.[0] ?? 'Invalid request'
      return apiErrorResponse(message, 400, { retryable: false })
    }

    const { email: emailLower, password } = parsed.data
    if (!emailLower.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return apiErrorResponse(`Only @${ALLOWED_DOMAIN} accounts can sign in.`, 403, {
        retryable: false,
      })
    }

    const supabase = await createClientServer()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailLower,
      password,
    })

    if (error) {
      let message = error.message
      if (error.message === 'Invalid login credentials') {
        message = 'Invalid email or password. Please check your credentials and try again.'
      } else if (error.message.includes('Email not confirmed')) {
        message = 'Please check your email and confirm your account before signing in.'
      } else if (error.message.includes('Too many requests')) {
        message = 'Too many login attempts. Please wait a moment and try again.'
      }
      return apiErrorResponse(message, 401, { retryable: false })
    }

    if (!data.user) {
      return apiErrorResponse('Login failed. Please try again.', 500)
    }

    return NextResponse.json({ success: true, user: data.user })
  } catch (err) {
    console.error('Sign-in error:', err)
    return apiErrorResponse('An unexpected error occurred. Please try again.', 500)
  }
}
