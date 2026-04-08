import { NextResponse } from 'next/server'
import { resolveEditorFlags } from '@/lib/auth/resolve-editor-flags'
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

    const { isEditor, isSuperUser } = await resolveEditorFlags(supabase, user.id)

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
