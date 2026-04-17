import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'
import { adminPatchMachineFamilyBodySchema } from '@/lib/validation/admin'

type RouteContext = { params: Promise<{ familyId: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
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

  const parsed = adminPatchMachineFamilyBodySchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request body'
    return apiErrorResponse(msg, 400, { retryable: false })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.supplier === null) {
    updates.supplier = null
  } else if (parsed.data.supplier !== undefined) {
    updates.supplier = parsed.data.supplier.trim() || null
  }

  const payloadKeys = Object.keys(updates).filter((k) => k !== 'updated_at')
  if (payloadKeys.length === 0) {
    return apiErrorResponse('No valid fields to update', 400, { retryable: false })
  }

  const service = createServiceRoleClient()
  const { data, error } = await service
    .from('machine_families')
    .update(updates)
    .eq('id', familyId)
    .select('*')
    .maybeSingle()

  if (error) {
    return apiErrorResponse(error.message, 500)
  }
  if (!data) {
    return apiErrorResponse('Machine type not found', 404, { retryable: false })
  }

  return NextResponse.json({ machineFamily: data })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
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
  const { error } = await service.from('machine_families').delete().eq('id', familyId)

  if (error) {
    if (error.code === '23503') {
      return apiErrorResponse(
        'Cannot delete: machines or other records still use this type. Remove those machines first.',
        409,
        { retryable: false }
      )
    }
    return apiErrorResponse(error.message, 500)
  }

  return NextResponse.json({ deleted: familyId })
}
