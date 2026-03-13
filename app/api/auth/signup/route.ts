import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'

/**
 * Server-side sign-up to avoid client "Failed to fetch" errors
 * (CORS, browser extensions, or network issues).
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

    const supabase = await createClientServer()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/dashboard`,
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
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

