import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import {
  buildSopListTitleSearchFilter,
  parseSopListPageParams,
  slicePageWithHasMore,
} from '@/features/sops/server/sop-list-query'
import { createClientServer } from '@/lib/supabase/server'
import type { SOP } from '@/lib/types'
import { z } from 'zod'

const SOP_COLUMNS =
  'id, title, description, owner, published, share_slug, created_at, updated_at, last_edited_by, sop_number'

function stripTrainingModules(row: Record<string, unknown>): SOP {
  const { sop_training_modules: _t, ...rest } = row
  return rest as unknown as SOP
}

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

    const url = request.nextUrl
    const { limit, offset, q } = parseSopListPageParams(url.searchParams)
    const trainingModuleRaw = (url.searchParams.get('trainingModuleId') || '').trim()
    let trainingModuleId: string | undefined
    if (trainingModuleRaw) {
      const parsedTm = z.string().uuid().safeParse(trainingModuleRaw)
      if (!parsedTm.success) {
        return apiErrorResponse('Invalid trainingModuleId', 400, { retryable: false })
      }
      trainingModuleId = parsedTm.data
    }
    const titleSearch = buildSopListTitleSearchFilter(q)

    const selectCols = trainingModuleId
      ? `${SOP_COLUMNS}, sop_training_modules!inner(training_module_id)`
      : SOP_COLUMNS

    let query = supabase
      .from('sops')
      // Dynamic join column list is not inferred by generated types.
      .select(selectCols as never)
      .eq('published', true)
      .not('share_slug', 'is', null)

    if (trainingModuleId) {
      query = query.eq('sop_training_modules.training_module_id', trainingModuleId)
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
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(offset, offset + fetchCount - 1)

    if (error) {
      console.error('GET /api/dashboard/published-sops:', error)
      return apiErrorResponse(error.message, 500)
    }

    const rows = (data ?? []) as unknown[]
    const { items: slice, hasMore } = slicePageWithHasMore(rows, limit)
    const items = slice.map((row) =>
      stripTrainingModules(row as Record<string, unknown>)
    )

    let totalSops: number | undefined
    if (offset === 0) {
      const { count } = await supabase.from('sops').select('*', { count: 'exact', head: true })
      totalSops = count ?? undefined
    }

    return NextResponse.json({ items, hasMore, totalSops })
  } catch (e) {
    console.error('GET /api/dashboard/published-sops error:', e)
    return apiErrorResponse('Internal server error', 500)
  }
}
