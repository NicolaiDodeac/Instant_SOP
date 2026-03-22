/** Fixed locale so SSR (Node) and the browser produce identical strings — avoids hydration mismatches. */
const LOCALE = 'en-GB'

const listDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatSopListDate(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  return listDateFormatter.format(t)
}

export function formatSopDateTime(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  return dateTimeFormatter.format(t)
}
