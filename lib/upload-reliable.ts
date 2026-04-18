/**
 * Resilient uploads for flaky networks: retries with exponential backoff + jitter,
 * optional refresh of presigned PUT URLs when R2 returns 403 (expired signature).
 */

export const UPLOAD_RETRY_DEFAULTS = {
  maxAttempts: 5,
  /** Extra loops when POST …/sign-upload succeeds but the presigned PUT URL is no longer valid */
  maxPresignCycles: 4,
  baseDelayMs: 700,
  maxDelayMs: 14_000,
} as const

export type UploadRetryInfo = {
  phase: 'sign' | 'put' | 'resign' | 'sync' | 'api'
  attempt: number
  delayMs: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function jitteredBackoff(attemptIndex: number): number {
  const cap = UPLOAD_RETRY_DEFAULTS.maxDelayMs
  const base = UPLOAD_RETRY_DEFAULTS.baseDelayMs * 2 ** attemptIndex
  const exp = Math.min(cap, base)
  const jitter = Math.random() * 0.35 * exp
  return Math.round(exp * 0.65 + jitter)
}

/** Status codes where repeating the same request may succeed later */
export function isRetriableHttpStatus(status: number): boolean {
  if (status === 408 || status === 425 || status === 429) return true
  if (status >= 500 && status <= 599) return true
  return false
}

export type FetchWithRetryOptions = {
  maxAttempts?: number
  isRetriableStatus?: (status: number) => boolean
  onRetry?: (info: UploadRetryInfo & { reason: string }) => void
  phase?: UploadRetryInfo['phase']
}

/**
 * fetch() with retries on thrown network errors and retriable HTTP statuses.
 * On the last attempt, returns the response even when not ok (caller handles errors).
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: FetchWithRetryOptions
): Promise<Response> {
  const maxAttempts = options?.maxAttempts ?? UPLOAD_RETRY_DEFAULTS.maxAttempts
  const isRetriable = options?.isRetriableStatus ?? isRetriableHttpStatus
  const phase: UploadRetryInfo['phase'] = options?.phase ?? 'put'
  const onRetry = options?.onRetry

  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(input, init)
      if (res.ok) return res
      const reason = `HTTP ${res.status}`
      if (!isRetriable(res.status) || attempt === maxAttempts - 1) {
        return res
      }
      const delayMs = jitteredBackoff(attempt)
      onRetry?.({ phase, attempt: attempt + 1, delayMs, reason })
      await sleep(delayMs)
    } catch (e) {
      lastErr = e
      if (attempt === maxAttempts - 1) throw e
      const delayMs = jitteredBackoff(attempt)
      const reason = e instanceof Error ? e.message : 'network error'
      onRetry?.({ phase, attempt: attempt + 1, delayMs, reason })
      await sleep(delayMs)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchWithRetry failed')
}

export async function postJsonWithRetry(
  url: string,
  body: unknown,
  options?: FetchWithRetryOptions
): Promise<Response> {
  const json = JSON.stringify(body)
  return fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    },
    { ...options, phase: options?.phase ?? 'sign' }
  )
}

export type SignUploadJson = { signedUrl: string; storagePath: string }

/**
 * POST `/api/videos/sign-upload` then PUT the blob to the presigned URL.
 * - Retries sign and put independently on transient failures.
 * - If the PUT returns 403 (common when the presigned URL expired mid-flight), requests a new sign URL and retries the PUT.
 */
export async function signUploadPutBlob(options: {
  signBody: Record<string, unknown>
  blob: Blob
  putContentType: string
  signEndpoint?: string
  onRetry?: (info: UploadRetryInfo & { reason: string }) => void
}): Promise<SignUploadJson> {
  const signEndpoint = options.signEndpoint ?? '/api/videos/sign-upload'
  const maxCycles = UPLOAD_RETRY_DEFAULTS.maxPresignCycles

  for (let cycle = 0; cycle < maxCycles; cycle++) {
    const signRes = await postJsonWithRetry(signEndpoint, options.signBody, {
      phase: 'sign',
      onRetry: options.onRetry,
    })

    if (!signRes.ok) {
      const text = await signRes.text().catch(() => '')
      throw new Error(text || `Sign upload failed (HTTP ${signRes.status})`)
    }

    let parsed: SignUploadJson
    try {
      parsed = (await signRes.json()) as SignUploadJson
    } catch {
      throw new Error('Invalid JSON from sign-upload')
    }
    if (!parsed.signedUrl || !parsed.storagePath) {
      throw new Error('sign-upload response missing signedUrl or storagePath')
    }

    const putRes = await fetchWithRetry(
      parsed.signedUrl,
      {
        method: 'PUT',
        body: options.blob,
        headers: { 'Content-Type': options.putContentType },
      },
      {
        phase: 'put',
        onRetry: options.onRetry,
      }
    )

    if (putRes.ok) {
      return { signedUrl: parsed.signedUrl, storagePath: parsed.storagePath }
    }

    if (putRes.status === 403 && cycle < maxCycles - 1) {
      const delayMs = jitteredBackoff(cycle)
      options.onRetry?.({
        phase: 'resign',
        attempt: cycle + 1,
        delayMs,
        reason: 'presigned PUT returned 403',
      })
      await sleep(delayMs)
      continue
    }

    const errText = await putRes.text().catch(() => '')
    throw new Error(errText || `Upload failed (HTTP ${putRes.status})`)
  }

  throw new Error('Upload failed after refreshing signed URL')
}
