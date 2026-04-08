import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  buildMachineFamilyCodeBase,
  truncateMachineFamilyCode,
} from '@/lib/machine-family-code'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'

const MAX_CODE_LEN = 180

function normalizeExplicitCode(raw: string): string {
  return raw.replace(/\s+/g, '_').toUpperCase()
}

function deriveAutoCode(name: string, supplier: string | null): string {
  const base = buildMachineFamilyCodeBase(name, supplier)
  if (base) return truncateMachineFamilyCode(base)
  return `MF_${randomBytes(4).toString('hex').toUpperCase()}`
}

function codeWithUniqueSuffix(base: string, attempt: number): string {
  if (attempt === 0) return truncateMachineFamilyCode(base)
  const suffix = `_${attempt + 1}`
  const trimmedBase = base.slice(0, Math.max(1, MAX_CODE_LEN - suffix.length))
  return truncateMachineFamilyCode(trimmedBase + suffix)
}

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
  const supplier =
    body.supplier === null || body.supplier === undefined
      ? null
      : typeof body.supplier === 'string'
        ? body.supplier.trim() || null
        : null
  const uses_hmi_station_codes = body.uses_hmi_station_codes === true

  if (!name) {
    return NextResponse.json({ error: 'Missing or invalid name' }, { status: 400 })
  }

  const explicit = codeRaw.length > 0
  const service = createServiceRoleClient()

  if (explicit) {
    const code = normalizeExplicitCode(codeRaw)
    if (!code) {
      return NextResponse.json({ error: 'Missing or invalid code or name' }, { status: 400 })
    }

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

  const autoBase = deriveAutoCode(name, supplier)

  for (let attempt = 0; attempt < 50; attempt++) {
    const code = codeWithUniqueSuffix(autoBase, attempt)
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

    if (!insertError && inserted?.id) {
      return NextResponse.json({ machineFamily: inserted })
    }

    if (insertError?.code === '23505') {
      continue
    }

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json(
    { error: 'Could not assign a unique type code. Add a more specific name or supplier.' },
    { status: 409 }
  )
}
