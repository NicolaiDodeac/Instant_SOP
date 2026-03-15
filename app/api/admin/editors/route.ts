import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'

function requireSuperUser(supabase: Awaited<ReturnType<typeof createClientServer>>) {
  return async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return { ok: false, status: 401 as const, json: { error: 'Unauthorized' } }
    }
    const superUserId = process.env.SUPER_USER_ID
    if (!superUserId || user.id !== superUserId) {
      return { ok: false, status: 403 as const, json: { error: 'Forbidden' } }
    }
    return { ok: true, user } as const
  }
}

export async function GET() {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)()
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const service = createServiceRoleClient()
  const { data: rows, error: listError } = await service
    .from('allowed_editors')
    .select('user_id')

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 })
  }

  const editors: { user_id: string; email: string | null }[] = []
  for (const row of rows ?? []) {
    const { data: authUser } = await service.auth.admin.getUserById(row.user_id)
    editors.push({
      user_id: row.user_id,
      email: authUser?.user?.email ?? null,
    })
  }

  return NextResponse.json({ editors })
}

export async function POST(request: NextRequest) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)()
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) {
    return NextResponse.json({ error: 'Missing or invalid email' }, { status: 400 })
  }

  const service = createServiceRoleClient()
  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 })
  const authUser = list?.users?.find((u) => u.email?.toLowerCase() === email)

  if (!authUser?.id) {
    return NextResponse.json(
      { error: 'No user found with that email. They must sign in at least once.' },
      { status: 404 }
    )
  }

  const { error: insertError } = await service
    .from('allowed_editors')
    .insert({ user_id: authUser.id })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'That user is already an editor.' }, { status: 409 })
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    added: { user_id: authUser.id, email: authUser.email ?? null },
  })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)()
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const user_id = request.nextUrl.searchParams.get('user_id')
  if (!user_id) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
  }

  const service = createServiceRoleClient()
  const { error } = await service
    .from('allowed_editors')
    .delete()
    .eq('user_id', user_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ removed: user_id })
}
