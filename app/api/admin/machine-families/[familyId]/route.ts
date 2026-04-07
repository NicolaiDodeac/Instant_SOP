import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'

type RouteContext = { params: Promise<{ familyId: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const { familyId } = await context.params
  if (!familyId) {
    return NextResponse.json({ error: 'Missing family id' }, { status: 400 })
  }

  let body: { name?: string; supplier?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string') {
    const n = body.name.trim()
    if (!n) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }
    updates.name = n
  }
  if (body.supplier === null) {
    updates.supplier = null
  } else if (typeof body.supplier === 'string') {
    updates.supplier = body.supplier.trim() || null
  }

  const payloadKeys = Object.keys(updates).filter((k) => k !== 'updated_at')
  if (payloadKeys.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const service = createServiceRoleClient()
  const { data, error } = await service
    .from('machine_families')
    .update(updates)
    .eq('id', familyId)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Machine type not found' }, { status: 404 })
  }

  return NextResponse.json({ machineFamily: data })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const { familyId } = await context.params
  if (!familyId) {
    return NextResponse.json({ error: 'Missing family id' }, { status: 400 })
  }

  const service = createServiceRoleClient()
  const { error } = await service.from('machine_families').delete().eq('id', familyId)

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        {
          error:
            'Cannot delete: machines or other records still use this type. Remove those machines first.',
        },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: familyId })
}
