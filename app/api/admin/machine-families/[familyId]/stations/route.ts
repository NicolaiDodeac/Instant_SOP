import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'
import type { MachineFamilyStation } from '@/lib/types'
import { adminCreateStationBodySchema } from '@/lib/validation/admin'

type RouteContext = { params: Promise<{ familyId: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const { familyId } = await context.params
  if (!familyId) {
    return apiErrorResponse('Missing family id', 400, { retryable: false })
  }

  const service = createServiceRoleClient()
  const { data, error } = await service
    .from('machine_family_stations')
    .select('*')
    .eq('machine_family_id', familyId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('station_code', { ascending: true })

  if (error) {
    return apiErrorResponse(error.message, 500)
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
    return apiErrorResponse('Missing family id', 400, { retryable: false })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiErrorResponse('Invalid JSON', 400, { retryable: false })
  }

  const parsed = adminCreateStationBodySchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request body'
    return apiErrorResponse(msg, 400, { retryable: false })
  }

  const { station_code, name, section, sort_order } = parsed.data

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
      return apiErrorResponse(
        'This station code already exists for this machine type.',
        409,
        { retryable: false }
      )
    }
    return apiErrorResponse(insertError.message, 500)
  }

  return NextResponse.json({ station: inserted as MachineFamilyStation })
}
