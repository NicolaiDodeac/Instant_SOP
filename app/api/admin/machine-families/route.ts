import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'

/** Minimal HMI-style starter (on-screen codes + Faults). */
const HMI_TEMPLATE_STATIONS: Array<{
  station_code: number
  name: string
  section: string
  sort_order: number
}> = [
  { station_code: 1003, name: 'HMI', section: 'HMI', sort_order: 5 },
  { station_code: 9900, name: 'Faults', section: 'Faults', sort_order: 999 },
]

/** Name-based zones (internal station_code only); matches other seeded families. */
const NAMED_ZONE_TEMPLATE_STATIONS: Array<{
  station_code: number
  name: string
  section: string
  sort_order: number
}> = [
  {
    station_code: 9010,
    name: 'HMI (control panel)',
    section: 'HMI (control panel)',
    sort_order: 900,
  },
  { station_code: 9090, name: 'Faults', section: 'Faults', sort_order: 999 },
]

export async function POST(request: NextRequest) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  let body: {
    code?: string
    name?: string
    supplier?: string | null
    uses_hmi_station_codes?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const codeRaw = typeof body.code === 'string' ? body.code.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const code = codeRaw.replace(/\s+/g, '_').toUpperCase()
  const supplier =
    body.supplier === null || body.supplier === undefined
      ? null
      : typeof body.supplier === 'string'
        ? body.supplier.trim() || null
        : null
  const uses_hmi_station_codes = body.uses_hmi_station_codes === true

  if (!code || !name) {
    return NextResponse.json({ error: 'Missing or invalid code or name' }, { status: 400 })
  }

  const service = createServiceRoleClient()

  const { data: inserted, error: insertError } = await service
    .from('machine_families')
    .insert({
      code,
      name,
      supplier,
      active: true,
      uses_hmi_station_codes,
    })
    .select('id, code, name, supplier, active, uses_hmi_station_codes')
    .maybeSingle()

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'A machine family with this code already exists.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  if (!inserted?.id) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  const stationRows = (uses_hmi_station_codes ? HMI_TEMPLATE_STATIONS : NAMED_ZONE_TEMPLATE_STATIONS).map(
    (s) => ({
      machine_family_id: inserted.id,
      station_code: s.station_code,
      name: s.name,
      section: s.section,
      sort_order: s.sort_order,
      active: true,
    })
  )

  const { error: stationsError } = await service.from('machine_family_stations').insert(stationRows)

  if (stationsError) {
    await service.from('machine_families').delete().eq('id', inserted.id)
    return NextResponse.json(
      { error: `Family created but station template failed: ${stationsError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ machineFamily: inserted })
}
