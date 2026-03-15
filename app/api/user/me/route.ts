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

    let isSuperUser = false
    try {
      const { data: superUserRow } = await supabase
        .from('super_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()
      isSuperUser = !!superUserRow
    } catch {
      // super_users table may not exist yet if migration not run
    }
    const superUserIdEnv = process.env.SUPER_USER_ID
    if (!!superUserIdEnv && superUserIdEnv === user.id) isSuperUser = true
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
