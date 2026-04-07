import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'

type RouteContext = { params: Promise<{ machineId: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const { machineId } = await context.params
  if (!machineId) {
    return NextResponse.json({ error: 'Missing machine id' }, { status: 400 })
  }

  let body: { name?: string; active?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: { name?: string; active?: boolean; updated_at?: string } = {}
  if (typeof body.name === 'string') {
    const n = body.name.trim()
    if (!n) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }
    updates.name = n
  }
  if (typeof body.active === 'boolean') {
    updates.active = body.active
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const service = createServiceRoleClient()
  const { data, error } = await service
    .from('machines')
    .update(updates)
    .eq('id', machineId)
    .select('*, machine_families(*)')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A machine with this name already exists on that leg.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Machine not found' }, { status: 404 })
  }

  return NextResponse.json({ machine: data })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const { machineId } = await context.params
  if (!machineId) {
    return NextResponse.json({ error: 'Missing machine id' }, { status: 400 })
  }

  const service = createServiceRoleClient()
  const { error } = await service.from('machines').delete().eq('id', machineId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: machineId })
}
