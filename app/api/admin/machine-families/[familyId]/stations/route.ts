import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'
import type { MachineFamilyStation } from '@/lib/types'

type RouteContext = { params: Promise<{ familyId: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
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
  const { data, error } = await service
    .from('machine_family_stations')
    .select('*')
    .eq('machine_family_id', familyId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('station_code', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ stations: (data ?? []) as MachineFamilyStation[] })
}

export async function POST(request: NextRequest, context: RouteContext) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const { familyId } = await context.params
  if (!familyId) {
    return NextResponse.json({ error: 'Missing family id' }, { status: 400 })
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

  const station_code =
    typeof body.station_code === 'number' && Number.isInteger(body.station_code)
      ? body.station_code
      : NaN
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const section = typeof body.section === 'string' ? body.section.trim() : ''
  const sort_order =
    body.sort_order === null || body.sort_order === undefined
      ? null
      : typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
        ? Math.trunc(body.sort_order)
        : null

  if (!Number.isFinite(station_code) || !name || !section) {
    return NextResponse.json(
      { error: 'Missing or invalid station_code, name, or section' },
      { status: 400 }
    )
  }

  const service = createServiceRoleClient()
  const { data: inserted, error: insertError } = await service
    .from('machine_family_stations')
    .insert({
      machine_family_id: familyId,
      station_code,
      name,
      section,
      sort_order,
      active: true,
    })
    .select('*')
    .maybeSingle()

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'This station code already exists for this machine type.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ station: inserted as MachineFamilyStation })
}
