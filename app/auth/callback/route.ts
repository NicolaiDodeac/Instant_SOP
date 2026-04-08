import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'

const ALLOWED_DOMAIN = 'magna.co.uk'

function safeNextPath(raw: string | null): string {
  if (!raw) return '/dashboard'
  const t = raw.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return '/dashboard'
  return t
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = safeNextPath(requestUrl.searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_code', requestUrl.origin))
  }

  const supabase = await createClientServer()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Auth callback exchange error:', error)
    return NextResponse.redirect(new URL('/auth/login?error=exchange_failed', requestUrl.origin))
  }

  const user = data?.user
  const email = user?.email?.toLowerCase() ?? ''
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(
      new URL('/auth/login?error=domain&message=' + encodeURIComponent('Only @' + ALLOWED_DOMAIN + ' accounts can sign in.'), requestUrl.origin)
    )
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
