import type { SopAuthorMeta } from '@/lib/types'

export const SOP_AUTHOR_BATCH_SIZE = 40

export async function fetchSopAuthorsBatched(
  sopIds: string[],
  options?: { signal?: AbortSignal }
): Promise<Record<string, SopAuthorMeta>> {
  const unique = [...new Set(sopIds)]
  const merged: Record<string, SopAuthorMeta> = {}
  const { signal } = options ?? {}

  for (let i = 0; i < unique.length; i += SOP_AUTHOR_BATCH_SIZE) {
    if (signal?.aborted) break
    const chunk = unique.slice(i, i + SOP_AUTHOR_BATCH_SIZE)
    const res = await fetch(
      `/api/sop-author?sopIds=${encodeURIComponent(chunk.join(','))}`,
      { signal }
    )
    if (!res.ok) continue
    const data = (await res.json()) as { authors?: Record<string, SopAuthorMeta> }
    Object.assign(merged, data.authors ?? {})
  }
  return merged
}
