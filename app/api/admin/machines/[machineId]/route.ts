import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'
import { adminPatchMachineBodySchema } from '@/lib/validation/admin'

type RouteContext = { params: Promise<{ machineId: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const { machineId } = await context.params
  if (!machineId) {
    return apiErrorResponse('Missing machine id', 400, { retryable: false })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiErrorResponse('Invalid JSON', 400, { retryable: false })
  }

  const parsed = adminPatchMachineBodySchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request body'
    return apiErrorResponse(msg, 400, { retryable: false })
  }

  const updates: { name?: string; active?: boolean; updated_at?: string } = {}
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.active !== undefined) updates.active = parsed.data.active
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
      return apiErrorResponse(
        'A machine with this name already exists on that leg.',
        409,
        { retryable: false }
      )
    }
    return apiErrorResponse(error.message, 500)
  }
  if (!data) {
    return apiErrorResponse('Machine not found', 404, { retryable: false })
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
    return apiErrorResponse('Missing machine id', 400, { retryable: false })
  }

  const service = createServiceRoleClient()
  const { error } = await service.from('machines').delete().eq('id', machineId)

  if (error) {
    return apiErrorResponse(error.message, 500)
  }

  return NextResponse.json({ deleted: machineId })
}
