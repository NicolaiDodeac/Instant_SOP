import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      'Missing Supabase environment variables. Create a .env.local file with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. See ENV_SETUP.md for instructions.'
    )
    return new NextResponse(
      'Supabase is not configured. Create a .env.local file with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. See ENV_SETUP.md for instructions.',
      { status: 503 }
    )
  }

  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh session if expired - required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Handle root path - redirect authenticated users to dashboard
  if (pathname === '/') {
    if (user) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    } else {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }
  }

  // Protect dashboard, editor, and SOP share viewer (content requires login)
  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/editor') ||
    pathname.startsWith('/sop/')
  ) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.search = ''
      url.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
      return NextResponse.redirect(url)
    }
  }

  // Redirect authenticated users away from login page (honor ?next= when safe)
  if (pathname.startsWith('/auth/login')) {
    if (user) {
      const next = request.nextUrl.searchParams.get('next')
      if (next && next.startsWith('/') && !next.startsWith('//')) {
        return NextResponse.redirect(new URL(next, request.nextUrl))
      }
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
