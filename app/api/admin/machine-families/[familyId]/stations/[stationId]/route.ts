import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'
import type { MachineFamilyStation } from '@/lib/types'
import { adminPatchStationBodySchema } from '@/lib/validation/admin'

type RouteContext = { params: Promise<{ familyId: string; stationId: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const { familyId, stationId } = await context.params
  if (!familyId || !stationId) {
    return apiErrorResponse('Missing family or station id', 400, { retryable: false })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiErrorResponse('Invalid JSON', 400, { retryable: false })
  }

  const parsed = adminPatchStationBodySchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request body'
    return apiErrorResponse(msg, 400, { retryable: false })
  }

  const service = createServiceRoleClient()
  const { data: existing, error: exErr } = await service
    .from('machine_family_stations')
    .select('id, machine_family_id, station_code')
    .eq('id', stationId)
    .maybeSingle()

  if (exErr || !existing || existing.machine_family_id !== familyId) {
    return apiErrorResponse('Station not found', 404, { retryable: false })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (parsed.data.station_code !== undefined) updates.station_code = parsed.data.station_code
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.section !== undefined) updates.section = parsed.data.section
  if (parsed.data.sort_order === null) {
    updates.sort_order = null
  } else if (parsed.data.sort_order !== undefined) {
    updates.sort_order = parsed.data.sort_order
  }

  const payloadKeys = Object.keys(updates).filter((k) => k !== 'updated_at')
  if (payloadKeys.length === 0) {
    return apiErrorResponse('No valid fields to update', 400, { retryable: false })
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
      return apiErrorResponse(
        'Another station already uses this station code.',
        409,
        { retryable: false }
      )
    }
    return apiErrorResponse(error.message, 500)
  }
  if (!data) {
    return apiErrorResponse('Station not found', 404, { retryable: false })
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
    return apiErrorResponse('Missing family or station id', 400, { retryable: false })
  }

  const service = createServiceRoleClient()
  const { data: row, error: rErr } = await service
    .from('machine_family_stations')
    .select('id, machine_family_id, station_code')
    .eq('id', stationId)
    .maybeSingle()

  if (rErr || !row || row.machine_family_id !== familyId) {
    return apiErrorResponse('Station not found', 404, { retryable: false })
  }

  const { error } = await service
    .from('machine_family_stations')
    .delete()
    .eq('id', stationId)
    .eq('machine_family_id', familyId)

  if (error) {
    return apiErrorResponse(error.message, 500)
  }

  return NextResponse.json({ deleted: stationId })
}
