import { NextRequest, NextResponse } from 'next/server'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { createClientServer } from '@/lib/supabase/server'
import { presignGetForVideoPath } from '@/lib/presign-video-path'

const MAX_PATHS = 64

/**
 * Batch presign for viewer pages: one round trip, same access checks as GET /api/videos/signed-url.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClientServer()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { paths?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!Array.isArray(body.paths)) {
      return NextResponse.json({ error: 'Expected paths array' }, { status: 400 })
    }

    const raw = body.paths.filter((p): p is string => typeof p === 'string')
    const unique = [...new Set(raw)]
    if (unique.length > MAX_PATHS) {
      return NextResponse.json(
        { error: `At most ${MAX_PATHS} paths per request` },
        { status: 400 }
      )
    }

    const isSuperUser = await resolveIsSuperUser(supabase, user.id)

    const urls: Record<string, string | null> = {}
    await Promise.all(
      unique.map(async (path) => {
        const result = await presignGetForVideoPath(supabase, user.id, isSuperUser, path)
        urls[path] = result.ok ? result.url : null
      })
    )

    return NextResponse.json({ urls })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in signed-urls:', error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
