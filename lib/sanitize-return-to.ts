/** Same-origin relative path only (no open redirect). */
export function sanitizeInternalReturnPath(raw: string | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  return t
}
