/** Shared by dashboard and editor SOP list API routes. */

import {
  SOP_LIST_DEFAULT_PAGE_SIZE,
  SOP_LIST_MAX_LIMIT,
} from '@/features/sops/sop-list-constants'

export function parseSopListPageParams(searchParams: URLSearchParams): {
  limit: number
  offset: number
  q: string
} {
  const limit = Math.min(
    SOP_LIST_MAX_LIMIT,
    Math.max(
      1,
      parseInt(
        searchParams.get('limit') || String(SOP_LIST_DEFAULT_PAGE_SIZE),
        10
      ) || SOP_LIST_DEFAULT_PAGE_SIZE
    )
  )
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)
  const q = (searchParams.get('q') || '').trim()
  return { limit, offset, q }
}

export type SopListTitleSearchFilter =
  | { kind: 'none' }
  | { kind: 'title_ilike'; pattern: string }
  | { kind: 'title_or_sop_number'; pattern: string; sopNumber: number }

export function buildSopListTitleSearchFilter(q: string): SopListTitleSearchFilter {
  const trimmed = q.trim()
  if (!trimmed) return { kind: 'none' }
  const esc = trimmed.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const pattern = `%${esc}%`
  if (/^\d+$/.test(trimmed)) {
    return { kind: 'title_or_sop_number', pattern, sopNumber: parseInt(trimmed, 10) }
  }
  return { kind: 'title_ilike', pattern }
}

/** Extra row fetched to detect `hasMore` without a separate count query. */
export function slicePageWithHasMore<T>(rows: T[], limit: number): {
  items: T[]
  hasMore: boolean
} {
  const hasMore = rows.length > limit
  return { items: hasMore ? rows.slice(0, limit) : rows, hasMore }
}
