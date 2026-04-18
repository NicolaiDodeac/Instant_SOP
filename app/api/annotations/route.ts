import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { annotationCreateBodySchema } from '@/lib/validation/annotations'

/** POST: create a step_annotations row. Uses server auth + ownership/super-user check, then service-role insert so RLS is not blocking. */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClientServer()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiErrorResponse('Unauthorized', 401, { retryable: false })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiErrorResponse('Invalid JSON', 400, { retryable: false })
    }

    const parsed = annotationCreateBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request body'
      return apiErrorResponse(msg, 400, { retryable: false })
    }

    const { step_id, t_start_ms, t_end_ms, kind, x, y, angle, text, style } = parsed.data

    const service = createServiceRoleClient()

    // Resolve step -> sop and check owner or super user
    const { data: step, error: stepError } = await service
      .from('sop_steps')
      .select('id, sop_id')
      .eq('id', step_id)
      .single()

    if (stepError || !step) {
      return apiErrorResponse('Step not found', 404, { retryable: false })
    }

    const { data: sop } = await service
      .from('sops')
      .select('owner')
      .eq('id', step.sop_id)
      .single()

    const isOwner = sop?.owner === user.id
    const isSuperUser = await resolveIsSuperUser(service, user.id)

    if (!isOwner && !isSuperUser) {
      return apiErrorResponse(
        'Forbidden: only the SOP owner or a super user can add annotations',
        403,
        { retryable: false }
      )
    }

    const row: Record<string, unknown> = {
      step_id,
      t_start_ms,
      t_end_ms,
      kind,
      x,
      y,
    }
    if (angle !== undefined) row.angle = angle
    if (text !== undefined) row.text = text
    if (style != null) row.style = style

    const { data: inserted, error: insertError } = await service
      .from('step_annotations')
      .insert(row)
      .select()
      .single()

    if (insertError) {
      console.error('Annotation insert error:', insertError)
      return apiErrorResponse(insertError.message ?? 'Insert failed', 500)
    }

    return NextResponse.json(inserted)
  } catch (err) {
    console.error('POST /api/annotations error:', err)
    return apiErrorResponse(err instanceof Error ? err.message : 'Server error', 500)
  }
}
