import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'

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

  return NextResponse.json({ machineFamily: inserted })
}
