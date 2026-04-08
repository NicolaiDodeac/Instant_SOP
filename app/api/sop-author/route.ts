import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { loadAuthorsById, loadSopAuthorMetaForViewer, metaFromSopRow } from '@/lib/server/sop-author-meta'
import type { SopAuthorMeta } from '@/lib/types'

type SopRow = {
  id: string
  owner: string
  last_edited_by: string | null
  created_at: string
  updated_at: string
}

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl
    const sopId = url.searchParams.get('sopId')
    const sopIdsParam = url.searchParams.get('sopIds')

    if (sopId && sopIdsParam) {
      return NextResponse.json({ error: 'Use sopId or sopIds, not both' }, { status: 400 })
    }

    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (sopId) {
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const meta = await loadSopAuthorMetaForViewer(sopId)
      if (!meta) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      return NextResponse.json(meta)
    }

    if (sopIdsParam) {
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const ids = [...new Set(sopIdsParam.split(',').map((s) => s.trim()).filter(Boolean))].slice(
        0,
        40
      )
      if (ids.length === 0) {
        return NextResponse.json({ error: 'Invalid sopIds' }, { status: 400 })
      }

      const { data: sops, error: sopsError } = await supabase
        .from('sops')
        .select('id, owner, last_edited_by, created_at, updated_at')
        .in('id', ids)

      if (sopsError || !sops?.length) {
        return NextResponse.json({ authors: {} as Record<string, SopAuthorMeta> })
      }

      const rows = sops as SopRow[]
      const needIds: string[] = []
      for (const row of rows) {
        needIds.push(row.owner)
        if (row.last_edited_by && row.last_edited_by !== row.owner) {
          needIds.push(row.last_edited_by)
        }
      }

      const service = createServiceRoleClient()
      const byId = await loadAuthorsById(service, needIds)

      const metas: Record<string, SopAuthorMeta> = {}
      for (const row of rows) {
        metas[row.id] = metaFromSopRow(row, byId)
      }

      return NextResponse.json({ authors: metas })
    }

    return NextResponse.json({ error: 'Missing sopId or sopIds' }, { status: 400 })
  } catch (e) {
    console.error('GET /api/sop-author error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
