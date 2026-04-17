import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import {
  buildSopListTitleSearchFilter,
  parseSopListPageParams,
  slicePageWithHasMore,
} from '@/features/sops/server/sop-list-query'
import { resolveEditorFlags } from '@/lib/auth/resolve-editor-flags'
import { createClientServer } from '@/lib/supabase/server'
import type { SOP } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiErrorResponse('Unauthorized', 401, { retryable: false })
    }

    const { isEditor, isSuperUser } = await resolveEditorFlags(supabase, user.id)
    if (!isEditor) {
      return apiErrorResponse('Forbidden', 403, { retryable: false })
    }

    const url = request.nextUrl
    const { limit, offset, q } = parseSopListPageParams(url.searchParams)
    const titleSearch = buildSopListTitleSearchFilter(q)

    let query = supabase.from('sops').select('*')

    if (!isSuperUser) {
      query = query.eq('owner', user.id)
    }

    if (titleSearch.kind === 'title_ilike') {
      query = query.ilike('title', titleSearch.pattern)
    } else if (titleSearch.kind === 'title_or_sop_number') {
      query = query.or(
        `title.ilike.${titleSearch.pattern},sop_number.eq.${titleSearch.sopNumber}`
      )
    }

    const fetchCount = limit + 1
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + fetchCount - 1)

    if (error) {
      console.error('GET /api/editor/sops:', error)
      return apiErrorResponse(error.message, 500)
    }

    const rows = (data ?? []) as SOP[]
    const { items, hasMore } = slicePageWithHasMore(rows, limit)

    let totalSops: number | undefined
    if (offset === 0) {
      let countQuery = supabase.from('sops').select('*', { count: 'exact', head: true })
      if (!isSuperUser) {
        countQuery = countQuery.eq('owner', user.id)
      }
      const { count } = await countQuery
      totalSops = count ?? undefined
    }

    return NextResponse.json({ items, hasMore, totalSops })
  } catch (e) {
    console.error('GET /api/editor/sops error:', e)
    return apiErrorResponse('Internal server error', 500)
  }
}
