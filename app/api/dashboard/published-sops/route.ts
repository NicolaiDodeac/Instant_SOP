import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'
import type { SOP } from '@/lib/types'

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 30

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = request.nextUrl
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    )
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0)
    const q = (url.searchParams.get('q') || '').trim()
    const trainingModuleId = (url.searchParams.get('trainingModuleId') || '').trim()

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

    if (q) {
      const esc = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
      const pattern = `%${esc}%`
      if (/^\d+$/.test(q)) {
        const n = parseInt(q, 10)
        query = query.or(`title.ilike.${pattern},sop_number.eq.${n}`)
      } else {
        query = query.ilike('title', pattern)
      }
    }

    const fetchCount = limit + 1
    const { data, error } = await query
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(offset, offset + fetchCount - 1)

    if (error) {
      console.error('GET /api/dashboard/published-sops:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data ?? []) as unknown[]
    const hasMore = rows.length > limit
    const slice = hasMore ? rows.slice(0, limit) : rows
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
