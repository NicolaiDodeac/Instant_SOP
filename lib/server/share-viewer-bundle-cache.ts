import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { SOP, SOPStep, StepAnnotation } from '@/lib/types'

/** Use with `revalidateTag` after a published SOP’s share page data may have changed. */
export function shareViewerRevalidateTagForShareSlug(slug: string): string {
  return `share-viewer:${slug.trim()}`
}

export type PublishedSopViewerBundle = {
  sop: SOP
  steps: SOPStep[]
  annotations: Record<string, StepAnnotation[]>
}

/**
 * Published SOP rows + steps + annotations only (no signed URLs).
 * Service role + explicit `published`/slug filters — safe to cache (no user cookies).
 */
async function loadPublishedBundleWithServiceRole(
  trimmedSlug: string
): Promise<PublishedSopViewerBundle | null> {
  const service = createServiceRoleClient()

  const { data: sopData, error: sopError } = await service
    .from('sops')
    .select('*')
    .eq('share_slug', trimmedSlug)
    .eq('published', true)
    .maybeSingle()

  if (sopError || !sopData) return null

  const sop = sopData as SOP

  const { data: stepsData } = await service
    .from('sop_steps')
    .select('*')
    .eq('sop_id', sop.id)
    .order('idx', { ascending: true })

  const steps = (stepsData ?? []) as SOPStep[]

  const annotations: Record<string, StepAnnotation[]> = {}
  if (steps.length > 0) {
    const stepIds = steps.map((s) => s.id)
    const { data: annsData } = await service
      .from('step_annotations')
      .select('*')
      .in('step_id', stepIds)

    if (annsData) {
      for (const ann of annsData as StepAnnotation[]) {
        if (!annotations[ann.step_id]) annotations[ann.step_id] = []
        annotations[ann.step_id].push(ann)
      }
    }
  }

  return { sop, steps, annotations }
}

const BUNDLE_REVALIDATE_SECONDS = 300

/**
 * Cached published bundle (DB only). Presigns stay per-request in `loadPublicSopViewerPayload`.
 */
export async function getPublishedSopViewerBundleCached(
  shareSlug: string
): Promise<PublishedSopViewerBundle | null> {
  const trimmed = shareSlug?.trim()
  if (!trimmed) return null

  return unstable_cache(
    async () => loadPublishedBundleWithServiceRole(trimmed),
    ['published-sop-viewer-bundle', trimmed],
    {
      revalidate: BUNDLE_REVALIDATE_SECONDS,
      tags: [shareViewerRevalidateTagForShareSlug(trimmed)],
    }
  )()
}
