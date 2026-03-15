import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ user: null, isEditor: false })
    }

    const { data: editorRow } = await supabase
      .from('allowed_editors')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const superUserId = process.env.SUPER_USER_ID
    const isSuperUser = !!superUserId && superUserId === user.id
    const isEditor = !!editorRow || isSuperUser

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email ?? undefined,
      },
      isEditor,
      isSuperUser,
    })
  } catch (err) {
    console.error('GET /api/user/me error:', err)
    return NextResponse.json(
      { user: null, isEditor: false },
      { status: 500 }
    )
  }
}
