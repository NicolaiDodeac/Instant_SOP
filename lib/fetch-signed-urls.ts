/** Must match `MAX_PATHS` in `/api/videos/signed-urls`. */
export const SIGNED_URL_BATCH_SIZE = 64

export async function fetchSignedMediaUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    const res = await fetch(`/api/videos/signed-url?path=${encodeURIComponent(path)}`)
    if (!res.ok) return null
    const data = (await res.json()) as { url?: string }
    return data.url ?? null
  } catch (err) {
    console.error('Error loading signed URL:', path, err)
    return null
  }
}

/**
 * Batch presign (chunked) with GET fallback — same behavior as the share viewer.
 */
export async function fetchSignedMediaUrls(paths: string[]): Promise<Record<string, string | null>> {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (uniquePaths.length === 0) return {}

  let urlByPath: Record<string, string | null> = {}

  try {
    const chunks: string[][] = []
    for (let i = 0; i < uniquePaths.length; i += SIGNED_URL_BATCH_SIZE) {
      chunks.push(uniquePaths.slice(i, i + SIGNED_URL_BATCH_SIZE))
    }
    const batchResults = await Promise.all(
      chunks.map(async (chunk) => {
        const res = await fetch('/api/videos/signed-urls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: chunk }),
        })
        if (!res.ok) return null
        const data = (await res.json()) as { urls?: Record<string, string | null> }
        return data.urls ?? {}
      })
    )
    if (batchResults.every((m) => m != null)) {
      urlByPath = Object.assign({}, ...batchResults as Record<string, string | null>[])
    } else {
      urlByPath = await fetchSignedUrlsFallback(uniquePaths)
    }
  } catch {
    urlByPath = await fetchSignedUrlsFallback(uniquePaths)
  }

  return urlByPath
}

async function fetchSignedUrlsFallback(paths: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  await Promise.all(
    paths.map(async (path) => {
      out[path] = await fetchSignedMediaUrl(path)
    })
  )
  return out
}
