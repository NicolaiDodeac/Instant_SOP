import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import {
  buildMachineFamilyCodeBase,
  truncateMachineFamilyCode,
} from '@/lib/machine-family-code'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'
import {
  adminCreateMachineFamilyBodySchema,
  MACHINE_FAMILY_MAX_CODE_LEN,
} from '@/lib/validation/admin'

const MAX_CODE_LEN = MACHINE_FAMILY_MAX_CODE_LEN

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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiErrorResponse('Invalid JSON', 400, { retryable: false })
  }

  const parsed = adminCreateMachineFamilyBodySchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request body'
    return apiErrorResponse(msg, 400, { retryable: false })
  }

  const codeRaw = parsed.data.code?.trim() ?? ''
  const name = parsed.data.name
  const supplier =
    parsed.data.supplier === undefined
      ? null
      : parsed.data.supplier === null
        ? null
        : parsed.data.supplier.trim() || null
  const uses_hmi_station_codes = parsed.data.uses_hmi_station_codes === true

  const explicit = codeRaw.length > 0
  const service = createServiceRoleClient()

  if (explicit) {
    const code = normalizeExplicitCode(codeRaw)
    if (!code) {
      return apiErrorResponse('Missing or invalid code or name', 400, { retryable: false })
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
        return apiErrorResponse(
          'A machine family with this code already exists.',
          409,
          { retryable: false }
        )
      }
      return apiErrorResponse(insertError.message, 500)
    }

    if (!inserted?.id) {
      return apiErrorResponse('Insert failed', 500)
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
      return apiErrorResponse(insertError.message, 500)
    }
  }

  return apiErrorResponse(
    'Could not assign a unique type code. Add a more specific name or supplier.',
    409,
    { retryable: false }
  )
}
