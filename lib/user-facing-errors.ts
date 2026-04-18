/**
 * Map technical failures to short, actionable copy for in-app alerts and banners.
 */

const MIGRATION_HINT =
  'If the message mentions a missing column, run the latest database migrations (sop_steps.kind and sop_steps.text_payload).'

function httpStatusFromUnknown(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const s = (err as { status?: unknown }).status
  return typeof s === 'number' && Number.isFinite(s) ? s : undefined
}

/** Video or image upload to storage after automatic retries have been exhausted. */
export function userFacingUploadError(
  err: unknown,
  kind: 'video' | 'image' = 'video'
): string {
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  const again =
    kind === 'image'
      ? 'Try taking the photo again.'
      : 'Tap Retry to upload again.'

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('the internet connection appears to be offline')
  ) {
    return `Upload could not finish — the connection dropped. Check Wi‑Fi and ${again.toLowerCase()}`
  }
  if (lower.includes('403') || lower.includes('presigned')) {
    return kind === 'image'
      ? 'The upload link expired. Try taking the photo again.'
      : 'The upload link expired mid-flight. Tap Retry to request a new link.'
  }
  if (lower.includes('413') || lower.includes('too large') || lower.includes('entity too large')) {
    return kind === 'image'
      ? 'That photo is too large. Take a new photo or reduce resolution, then try again.'
      : 'That file is too large for storage. Try a shorter clip or lower resolution, then tap Retry.'
  }
  if (lower.includes('sign upload failed') && lower.includes('5')) {
    return `The server could not prepare an upload URL. Wait a moment and ${again.toLowerCase()}`
  }
  if (raw.length > 200) {
    return `${raw.slice(0, 197)}… ${again}`
  }
  if (raw.trim()) {
    return `${raw.trim()} ${again}`
  }
  return kind === 'image' ? 'Upload failed. Try taking the photo again.' : 'Upload failed. Tap Retry.'
}

/** Persisting the SOP via PUT /sync (after fetchWithRetry). */
export function userFacingSyncSaveError(err: unknown): string {
  const status = httpStatusFromUnknown(err)
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (status === 401 || /not authenticated|unauthorized|jwt|session/i.test(msg)) {
    return 'Your session expired. Sign in again, then tap Save.'
  }
  if (status === 403 || /forbidden/i.test(lower)) {
    return 'You do not have permission to save this SOP. Contact an admin if this is unexpected.'
  }
  if (
    status != null &&
    (status >= 500 || status === 408 || status === 429 || status === 425)
  ) {
    return 'The server could not save your changes right now. Wait a moment and tap Save again.'
  }
  if (
    status == null &&
    (/failed to fetch|networkerror|network request failed/i.test(msg) ||
      lower.includes('load failed'))
  ) {
    return 'Could not reach the server. Check your connection and tap Save again.'
  }

  const tail = /\bcolumn\b|relation|migration|schema/i.test(msg) ? `\n\n${MIGRATION_HINT}` : ''
  return `Could not save changes: ${msg}${tail}`
}
