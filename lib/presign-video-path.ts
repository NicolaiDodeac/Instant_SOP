import type { SupabaseClient } from '@supabase/supabase-js'
import { headObjectExists, presignGetObject } from '@/lib/r2'

export type PresignPathResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string }

/**
 * Same access rules as GET /api/videos/signed-url — used by batch and single routes.
 */
export async function presignGetForVideoPath(
  supabase: SupabaseClient,
  userId: string,
  isSuperUser: boolean,
  path: string
): Promise<PresignPathResult> {
  if (path.includes('..') || !path.includes('/')) {
    return { ok: false, status: 400, error: 'Invalid path format' }
  }

  if (!userId) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const { data: stepByVideo, error: stepVideoError } = await supabase
    .from('sop_steps')
    .select('sop_id, sops!inner(owner, published)')
    .eq('video_path', path)
    .maybeSingle()

  const { data: stepByImage, error: stepImageError } = await supabase
    .from('sop_steps')
    .select('sop_id, sops!inner(owner, published)')
    .eq('image_path', path)
    .maybeSingle()

  const { data: stepByThumb, error: stepThumbError } = await supabase
    .from('sop_steps')
    .select('sop_id, sops!inner(owner, published)')
    .eq('thumbnail_path', path)
    .maybeSingle()

  if (stepVideoError) {
    return { ok: false, status: 500, error: stepVideoError.message }
  }
  if (stepImageError) {
    return { ok: false, status: 500, error: stepImageError.message }
  }
  if (stepThumbError) {
    return { ok: false, status: 500, error: stepThumbError.message }
  }

  const step = stepByVideo ?? stepByImage ?? stepByThumb

  if (step) {
    const sopsData = step.sops
    const sop = (Array.isArray(sopsData) ? sopsData[0] : sopsData) as
      | { owner: string; published: boolean }
      | null
      | undefined
    if (!sop) {
      return { ok: false, status: 404, error: 'Not found' }
    }
    if (sop.owner !== userId && !sop.published && !isSuperUser) {
      return { ok: false, status: 403, error: 'Forbidden' }
    }
  } else {
    const parts = path.split('/')
    if (parts.length < 4) {
      return { ok: false, status: 404, error: 'Not found' }
    }
    const sopIdFromPath = parts[1]
    const uploader = parts[0]
    const { data: sop } = await supabase
      .from('sops')
      .select('owner, published')
      .eq('id', sopIdFromPath)
      .maybeSingle()
    if (!sop) {
      return { ok: false, status: 404, error: 'Not found' }
    }
    const canReadDraftPath =
      sop.published ||
      (sop.owner === userId && (uploader === userId || uploader === sop.owner)) ||
      (isSuperUser && (uploader === sop.owner || uploader === userId))
    if (!canReadDraftPath) {
      return { ok: false, status: 403, error: 'Forbidden' }
    }
  }

  let objectKey = path
  if (!(await headObjectExists(path))) {
    const filenameOnly = path.includes('/') ? path.split('/').pop()! : path
    if (filenameOnly && !filenameOnly.includes('..') && (await headObjectExists(filenameOnly))) {
      objectKey = filenameOnly
    } else {
      return { ok: false, status: 404, error: 'Not found' }
    }
  }

  try {
    const url = await presignGetObject(objectKey, 3600)
    return { ok: true, url }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating R2 signed URL:', { message: msg, path: objectKey })
    }
    return { ok: false, status: 500, error: msg || 'Failed to create signed URL' }
  }
}
