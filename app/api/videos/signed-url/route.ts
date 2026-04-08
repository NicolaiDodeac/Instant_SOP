import { NextRequest, NextResponse } from 'next/server'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { createClientServer } from '@/lib/supabase/server'
import { presignGetForVideoPath } from '@/lib/presign-video-path'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const path = searchParams.get('path')

    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
    }

    const supabase = await createClientServer()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const userId = user?.id ?? ''
    const isSuperUser = user?.id ? await resolveIsSuperUser(supabase, user.id) : false
    const result = await presignGetForVideoPath(supabase, userId, isSuperUser, path)

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ url: result.url })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in signed-url:', error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
