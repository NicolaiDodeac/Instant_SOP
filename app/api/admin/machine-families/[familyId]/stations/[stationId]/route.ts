import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'
import type { MachineFamilyStation } from '@/lib/types'

type RouteContext = { params: Promise<{ familyId: string; stationId: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const { familyId, stationId } = await context.params
  if (!familyId || !stationId) {
    return NextResponse.json({ error: 'Missing family or station id' }, { status: 400 })
  }

  let body: {
    station_code?: number
    name?: string
    section?: string
    sort_order?: number | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const service = createServiceRoleClient()
  const { data: existing, error: exErr } = await service
    .from('machine_family_stations')
    .select('id, machine_family_id, station_code')
    .eq('id', stationId)
    .maybeSingle()

  if (exErr || !existing || existing.machine_family_id !== familyId) {
    return NextResponse.json({ error: 'Station not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.station_code === 'number' && Number.isInteger(body.station_code)) {
    updates.station_code = body.station_code
  }
  if (typeof body.name === 'string') {
    const n = body.name.trim()
    if (!n) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }
    updates.name = n
  }
  if (typeof body.section === 'string') {
    const s = body.section.trim()
    if (!s) {
      return NextResponse.json({ error: 'Section cannot be empty' }, { status: 400 })
    }
    updates.section = s
  }
  if (body.sort_order === null) {
    updates.sort_order = null
  } else if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) {
    updates.sort_order = Math.trunc(body.sort_order)
  }

  const payloadKeys = Object.keys(updates).filter((k) => k !== 'updated_at')
  if (payloadKeys.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await service
    .from('machine_family_stations')
    .update(updates)
    .eq('id', stationId)
    .eq('machine_family_id', familyId)
    .select('*')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Another station already uses this station code.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Station not found' }, { status: 404 })
  }

  return NextResponse.json({ station: data as MachineFamilyStation })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const { familyId, stationId } = await context.params
  if (!familyId || !stationId) {
    return NextResponse.json({ error: 'Missing family or station id' }, { status: 400 })
  }

  const service = createServiceRoleClient()
  const { data: row, error: rErr } = await service
    .from('machine_family_stations')
    .select('id, machine_family_id, station_code')
    .eq('id', stationId)
    .maybeSingle()

  if (rErr || !row || row.machine_family_id !== familyId) {
    return NextResponse.json({ error: 'Station not found' }, { status: 404 })
  }

  const { error } = await service
    .from('machine_family_stations')
    .delete()
    .eq('id', stationId)
    .eq('machine_family_id', familyId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: stationId })
}
