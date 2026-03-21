/**
 * Canonical public origin (no path, no trailing slash) for share URLs and QR codes.
 * Set `NEXT_PUBLIC_APP_URL` to your production URL so copied links / QR work from localhost
 * and match what users open on phones (e.g. https://your-app.vercel.app).
 * If unset, falls back to `window.location.origin` in the browser.
 */
export function getPublicSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (raw) return raw.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function getSharePageUrl(shareSlug: string): string {
  const base = getPublicSiteOrigin()
  return base ? `${base}/sop/${shareSlug}` : ''
}
