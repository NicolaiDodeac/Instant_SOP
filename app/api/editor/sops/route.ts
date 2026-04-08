import { NextRequest, NextResponse } from 'next/server'
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isEditor, isSuperUser } = await resolveEditorFlags(supabase, user.id)
    if (!isEditor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
      return NextResponse.json({ error: error.message }, { status: 500 })
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
