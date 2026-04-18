import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { revalidatePublishedShareViewerCache } from '@/lib/server/share-viewer-bundle-cache'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { sopSyncPutBodySchema } from '@/lib/validation/sop-sync'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function isUuid(id: string): boolean {
  return UUID_REGEX.test(id)
}

/** PUT: sync full draft to DB (sop, steps, annotations). Caller must be owner or super user. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sopId: string }> }
) {
  try {
    const { sopId } = await params
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

    const parsed = sopSyncPutBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request body'
      return apiErrorResponse(msg, 400, { retryable: false })
    }

    const { title, description, steps, annotations: annotationsByStep } = parsed.data

    const service = createServiceRoleClient()

    const { data: sop } = await service.from('sops').select('owner').eq('id', sopId).single()
    if (!sop) {
      return apiErrorResponse('SOP not found', 404, { retryable: false })
    }
    const isOwner = sop.owner === user.id
    const isSuperUser = await resolveIsSuperUser(service, user.id)
    if (!isOwner && !isSuperUser) {
      return apiErrorResponse('Forbidden', 403, { retryable: false })
    }

    const sopPatch: Record<string, unknown> = { last_edited_by: user.id }
    if (title !== undefined) {
      sopPatch.title = title
      sopPatch.description = description ?? null
    }
    await service.from('sops').update(sopPatch).eq('id', sopId)

    const existingSteps = await service.from('sop_steps').select('id').eq('sop_id', sopId)
    const existingIds = new Set((existingSteps.data ?? []).map((r: { id: string }) => r.id))
    const sentStepIds = new Set(steps.map((s: { id: string }) => s.id))
    const newStepIds: Record<string, string> = {}

    for (const step of steps) {
      const payload = {
        sop_id: sopId,
        idx: step.idx,
        title: step.title ?? '',
        kind: step.kind === 'text' ? 'text' : 'media',
        instructions: step.instructions ?? null,
        video_path: step.video_path ?? null,
        thumbnail_path: step.thumbnail_path ?? null,
        image_path: step.image_path ?? null,
        text_payload: step.text_payload ?? null,
        duration_ms: step.duration_ms ?? null,
      }
      if (isUuid(step.id) && existingIds.has(step.id)) {
        await service.from('sop_steps').update(payload).eq('id', step.id)
      } else {
        const { data: inserted } = await service.from('sop_steps').insert(payload).select('id').single()
        if (inserted?.id) newStepIds[step.id] = inserted.id
      }
    }

    for (const id of existingIds) {
      if (!sentStepIds.has(id)) {
        await service.from('sop_steps').delete().eq('id', id)
      }
    }

    const resolveStepId = (localStepId: string) => newStepIds[localStepId] ?? localStepId

    for (const step of steps) {
      const finalStepId = resolveStepId(step.id)
      const anns = annotationsByStep[step.id] ?? []
      await service.from('step_annotations').delete().eq('step_id', finalStepId)
      for (const a of anns) {
        await service.from('step_annotations').insert({
          step_id: finalStepId,
          t_start_ms: a.t_start_ms,
          t_end_ms: a.t_end_ms,
          kind: a.kind,
          x: a.x,
          y: a.y,
          angle: a.angle ?? null,
          text: a.text ?? null,
          style: a.style ?? null,
        })
      }
    }

    const { data: shareRow } = await service
      .from('sops')
      .select('share_slug')
      .eq('id', sopId)
      .maybeSingle()
    const slug =
      (shareRow as { share_slug: string | null } | null)?.share_slug?.trim() ?? ''
    if (slug) {
      revalidatePublishedShareViewerCache(slug)
    }

    return NextResponse.json({ ok: true, newStepIds })
  } catch (err) {
    console.error('PUT /api/sops/[sopId]/sync error:', err)
    return apiErrorResponse(err instanceof Error ? err.message : 'Server error', 500)
  }
}
