import { NextResponse } from 'next/server'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'

/** DELETE: remove an SOP. Caller must be owner or super user. Uses service role so delete always runs. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sopId: string }> }
) {
  try {
    const { sopId } = await params
    const supabase = await createClientServer()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const service = createServiceRoleClient()
    const { data: sop } = await service.from('sops').select('owner').eq('id', sopId).single()

    if (!sop) {
      return NextResponse.json({ error: 'SOP not found' }, { status: 404 })
    }

    const isOwner = sop.owner === user.id
    const isSuperUser = await resolveIsSuperUser(service, user.id)

    if (!isOwner && !isSuperUser) {
      return NextResponse.json({ error: 'Forbidden: only the owner or a super user can delete this SOP' }, { status: 403 })
    }

    await service.from('sops').delete().eq('id', sopId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/sops/[sopId] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    )
  }
}
