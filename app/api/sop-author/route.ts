import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { loadAuthorsById, loadSopAuthorMetaForViewer, metaFromSopRow } from '@/lib/server/sop-author-meta'
import type { SopAuthorMeta } from '@/lib/types'
import { z } from 'zod'

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
      return apiErrorResponse('Use sopId or sopIds, not both', 400, { retryable: false })
    }

    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (sopId) {
      if (authError || !user) {
        return apiErrorResponse('Unauthorized', 401, { retryable: false })
      }

      const parsedSopId = z.string().uuid().safeParse(sopId)
      if (!parsedSopId.success) {
        return apiErrorResponse('Invalid sopId', 400, { retryable: false })
      }

      const meta = await loadSopAuthorMetaForViewer(parsedSopId.data)
      if (!meta) {
        return apiErrorResponse('Not found', 404, { retryable: false })
      }
      return NextResponse.json(meta)
    }

    if (sopIdsParam) {
      if (authError || !user) {
        return apiErrorResponse('Unauthorized', 401, { retryable: false })
      }

      const rawIds = [...new Set(sopIdsParam.split(',').map((s) => s.trim()).filter(Boolean))].slice(
        0,
        40
      )
      const ids: string[] = []
      for (const id of rawIds) {
        const p = z.string().uuid().safeParse(id)
        if (!p.success) {
          return apiErrorResponse('Invalid sopIds', 400, { retryable: false })
        }
        ids.push(p.data)
      }
      if (ids.length === 0) {
        return apiErrorResponse('Invalid sopIds', 400, { retryable: false })
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

    return apiErrorResponse('Missing sopId or sopIds', 400, { retryable: false })
  } catch (e) {
    console.error('GET /api/sop-author error:', e)
    return apiErrorResponse('Internal server error', 500)
  }
}
