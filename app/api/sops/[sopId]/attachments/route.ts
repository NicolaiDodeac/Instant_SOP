import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { querySopRoutingAttachments } from '@/lib/server/sop-attachments-read'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import type { SopRoutingAttachments } from '@/lib/types'
import { z } from 'zod'

const uuidSchema = z.string().uuid()

const sopRoutingAttachmentsPutSchema = z.object({
  trainingModuleIds: z.array(uuidSchema).max(500).optional().default([]),
  machineFamilyIds: z.array(uuidSchema).max(500).optional().default([]),
  stationIds: z.array(uuidSchema).max(500).optional().default([]),
  lineIds: z.array(uuidSchema).max(500).optional().default([]),
  lineLegIds: z.array(uuidSchema).max(500).optional().default([]),
  machineIds: z.array(uuidSchema).max(500).optional().default([]),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sopId: string }> }
) {
  try {
    const { sopId } = await params
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiErrorResponse('Unauthorized', 401, { retryable: false })
    }

    const service = createServiceRoleClient()
    const payload = await querySopRoutingAttachments(service, sopId)
    if (!payload) return apiErrorResponse('SOP not found', 404, { retryable: false })

    return NextResponse.json(payload)
  } catch (err) {
    console.error('GET /api/sops/[sopId]/attachments error:', err)
    return apiErrorResponse('Internal server error', 500)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sopId: string }> }
) {
  try {
    const { sopId } = await params
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiErrorResponse('Unauthorized', 401, { retryable: false })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiErrorResponse('Invalid JSON', 400, { retryable: false })
    }

    const parsed = sopRoutingAttachmentsPutSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request body'
      return apiErrorResponse(msg, 400, { retryable: false })
    }

    const next: SopRoutingAttachments = parsed.data

    const service = createServiceRoleClient()
    const { data: sop } = await service.from('sops').select('owner').eq('id', sopId).single()
    if (!sop) return apiErrorResponse('SOP not found', 404, { retryable: false })

    const ownerId = String((sop as { owner: string }).owner)
    const superUser = await resolveIsSuperUser(service, user.id)
    const canEdit = ownerId === user.id || superUser
    if (!canEdit) {
      return apiErrorResponse('Forbidden', 403, { retryable: false })
    }

    await Promise.all([
      service.from('sop_training_modules').delete().eq('sop_id', sopId),
      service.from('sop_machine_families').delete().eq('sop_id', sopId),
      service.from('sop_machine_family_stations').delete().eq('sop_id', sopId),
      service.from('sop_lines').delete().eq('sop_id', sopId),
      service.from('sop_line_legs').delete().eq('sop_id', sopId),
      service.from('sop_machines').delete().eq('sop_id', sopId),
    ])

    if (next.trainingModuleIds.length > 0) {
      await service.from('sop_training_modules').insert(
        next.trainingModuleIds.map((id) => ({ sop_id: sopId, training_module_id: id }))
      )
    }
    if (next.machineFamilyIds.length > 0) {
      await service.from('sop_machine_families').insert(
        next.machineFamilyIds.map((id) => ({ sop_id: sopId, machine_family_id: id }))
      )
    }
    if (next.stationIds.length > 0) {
      await service.from('sop_machine_family_stations').insert(
        next.stationIds.map((id) => ({ sop_id: sopId, station_id: id }))
      )
    }
    if (next.lineIds.length > 0) {
      await service.from('sop_lines').insert(next.lineIds.map((id) => ({ sop_id: sopId, line_id: id })))
    }
    if (next.lineLegIds.length > 0) {
      await service
        .from('sop_line_legs')
        .insert(next.lineLegIds.map((id) => ({ sop_id: sopId, line_leg_id: id })))
    }
    if (next.machineIds.length > 0) {
      await service
        .from('sop_machines')
        .insert(next.machineIds.map((id) => ({ sop_id: sopId, machine_id: id })))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PUT /api/sops/[sopId]/attachments error:', err)
    return apiErrorResponse('Internal server error', 500)
  }
}
