import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'

const ALLOWED_DOMAIN = 'magna.co.uk'

/**
 * Server-side sign-in to avoid client "Failed to fetch" errors
 * (CORS, browser extensions, or network issues).
 * Only @magna.co.uk accounts are allowed.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const emailLower = String(email).toLowerCase()
    if (!emailLower.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return NextResponse.json(
        { error: `Only @${ALLOWED_DOMAIN} accounts can sign in.` },
        { status: 403 }
      )
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
      return NextResponse.json({ error: message }, { status: 401 })
    }

    if (!data.user) {
      return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, user: data.user })
  } catch (err) {
    console.error('Sign-in error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
