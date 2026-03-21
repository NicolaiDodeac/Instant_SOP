import type { SupabaseClient } from '@supabase/supabase-js'
import { isAuthorizedVideoPath, isUuid } from '@/lib/video-edit-auth'

/**
 * Resolve R2 `video_path` for cut/speed: DB row when step id is a UUID; otherwise draft path from client
 * (must match `userId/sopId/...` and SOP access).
 */
export async function resolveStepVideoForProcessing(
  supabase: SupabaseClient,
  params: {
    userId: string
    sopId: string
    stepId: string
    videoPathFromBody?: string | null
  }
): Promise<
  | { ok: true; videoPath: string; canEnqueueAsyncJob: boolean }
  | { ok: false; status: number; error: string }
> {
  const { userId, sopId, stepId, videoPathFromBody } = params

  const { data: sopRow, error: sopErr } = await supabase.from('sops').select('owner').eq('id', sopId).maybeSingle()

  if (sopErr) return { ok: false, status: 500, error: sopErr.message }
  if (!sopRow) return { ok: false, status: 404, error: 'SOP not found' }

  let isSuperUser = false
  const { data: superRow } = await supabase.from('super_users').select('user_id').eq('user_id', userId).maybeSingle()
  isSuperUser = !!superRow
  if (process.env.SUPER_USER_ID && process.env.SUPER_USER_ID === userId) isSuperUser = true

  const isOwner = sopRow.owner === userId
  if (!isOwner && !isSuperUser) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  if (isUuid(stepId)) {
    const { data: step, error: stepErr } = await supabase
      .from('sop_steps')
      .select('video_path')
      .eq('id', stepId)
      .eq('sop_id', sopId)
      .maybeSingle()

    if (stepErr) return { ok: false, status: 500, error: stepErr.message }
    if (!step) return { ok: false, status: 404, error: 'Step not found' }
    if (!step.video_path) return { ok: false, status: 400, error: 'Step has no video' }
    return { ok: true, videoPath: step.video_path, canEnqueueAsyncJob: true }
  }

  if (!videoPathFromBody || typeof videoPathFromBody !== 'string') {
    return {
      ok: false,
      status: 400,
      error:
        'This step is not saved to the database yet. Pass videoPath, or sync the SOP so the step has a UUID.',
    }
  }

  if (!isAuthorizedVideoPath(videoPathFromBody, userId, sopId, sopRow.owner, isSuperUser)) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  return { ok: true, videoPath: videoPathFromBody, canEnqueueAsyncJob: false }
}
