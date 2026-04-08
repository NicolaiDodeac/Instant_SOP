import { cache } from 'react'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { presignGetForVideoPath } from '@/lib/presign-video-path'
import { getServerAuthSession } from '@/lib/server/auth-session'
import { getPublishedSopViewerBundleCached } from '@/lib/server/share-viewer-bundle-cache'
import { loadSopAuthorMetaForViewer } from '@/lib/server/sop-author-meta'
import type { SOP, SOPStep, SopAuthorMeta, StepAnnotation } from '@/lib/types'

export type PublicSopViewerPayload = {
  sop: SOP
  steps: SOPStep[]
  annotations: Record<string, StepAnnotation[]>
  videoUrls: Record<string, string | null>
  imageUrls: Record<string, string | null>
  posterUrls: Record<string, string | null>
  authorMeta: SopAuthorMeta | null
}

async function loadPublicSopViewerPayloadImpl(
  shareSlug: string
): Promise<PublicSopViewerPayload | null> {
  const trimmed = shareSlug?.trim()
  if (!trimmed) return null

  const { supabase, user } = await getServerAuthSession()
  if (!user) return null

  const isSuperUser = await resolveIsSuperUser(supabase, user.id)

  const bundle = await getPublishedSopViewerBundleCached(trimmed)
  if (!bundle) return null

  const { sop, steps, annotations } = bundle

  const pathSet = new Set<string>()
  for (const step of steps) {
    if (step.video_path) pathSet.add(step.video_path)
    if (step.image_path) pathSet.add(step.image_path)
    if (step.thumbnail_path) pathSet.add(step.thumbnail_path)
  }
  const uniquePaths = [...pathSet]

  const urlByPath: Record<string, string | null> = {}
  await Promise.all(
    uniquePaths.map(async (path) => {
      const r = await presignGetForVideoPath(supabase, user.id, isSuperUser, path)
      urlByPath[path] = r.ok ? r.url : null
    })
  )

  const videoUrls: Record<string, string | null> = {}
  const imageUrls: Record<string, string | null> = {}
  const posterUrls: Record<string, string | null> = {}

  for (const step of steps) {
    videoUrls[step.id] = step.video_path ? (urlByPath[step.video_path] ?? null) : null
    imageUrls[step.id] = step.image_path ? (urlByPath[step.image_path] ?? null) : null
    posterUrls[step.id] = step.thumbnail_path ? (urlByPath[step.thumbnail_path] ?? null) : null
  }

  const authorMeta = await loadSopAuthorMetaForViewer(sop.id)

  return {
    sop,
    steps,
    annotations,
    videoUrls,
    imageUrls,
    posterUrls,
    authorMeta,
  }
}

/** Dedupes work when the same request runs `generateMetadata` + page. */
export const loadPublicSopViewerPayload = cache(loadPublicSopViewerPayloadImpl)
