import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClientServer } from '@/lib/supabase/server'
import { isSuperUserIdFromEnv } from '@/lib/super-user-env'
import type { SOP } from '@/lib/types'

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 30

async function resolveEditorFlags(supabase: SupabaseClient, userId: string) {
  const { data: editorRow } = await supabase
    .from('allowed_editors')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  let isSuperUser = false
  try {
    const { data: superUserRow } = await supabase
      .from('super_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    isSuperUser = !!superUserRow
  } catch {
    // super_users table may not exist yet
  }
  if (isSuperUserIdFromEnv(userId)) isSuperUser = true
  const isEditor = !!editorRow || isSuperUser
  return { isEditor, isSuperUser }
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

    const { isEditor, isSuperUser } = await resolveEditorFlags(supabase, user.id)
    if (!isEditor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = request.nextUrl
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    )
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0)
    const q = (url.searchParams.get('q') || '').trim()

    let query = supabase.from('sops').select('*')

    if (!isSuperUser) {
      query = query.eq('owner', user.id)
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
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + fetchCount - 1)

    if (error) {
      console.error('GET /api/editor/sops:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data ?? []) as SOP[]
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows

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
