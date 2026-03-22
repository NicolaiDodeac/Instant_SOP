import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import type { SopAuthorInfo, SopAuthorMeta } from '@/lib/types'
import type { User } from '@supabase/supabase-js'

function pickDisplayName(meta: Record<string, unknown>, email: string | undefined): string {
  const n = meta.full_name ?? meta.name
  if (typeof n === 'string' && n.trim()) return n.trim()
  if (email?.includes('@')) return email.split('@')[0] ?? email
  return email ?? 'Creator'
}

function pickAvatarUrl(meta: Record<string, unknown>): string | null {
  const a = meta.avatar_url ?? meta.picture
  if (typeof a === 'string' && a.startsWith('http')) return a
  return null
}

function authorFromUser(u: User): SopAuthorInfo {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const email = u.email ?? undefined
  return {
    displayName: pickDisplayName(meta, email),
    email: u.email ?? null,
    avatarUrl: pickAvatarUrl(meta),
  }
}

type SopRow = {
  id: string
  owner: string
  last_edited_by: string | null
  created_at: string
  updated_at: string
}

const unknownAuthor: SopAuthorInfo = {
  displayName: 'Unknown',
  email: null,
  avatarUrl: null,
}

async function loadAuthorsById(
  service: ReturnType<typeof createServiceRoleClient>,
  userIds: string[]
): Promise<Map<string, SopAuthorInfo>> {
  const unique = [...new Set(userIds)].filter(Boolean)
  const map = new Map<string, SopAuthorInfo>()
  await Promise.all(
    unique.map(async (id) => {
      const { data } = await service.auth.admin.getUserById(id)
      if (data?.user) map.set(id, authorFromUser(data.user))
    })
  )
  return map
}

function metaFromRow(row: SopRow, byId: Map<string, SopAuthorInfo>): SopAuthorMeta {
  const creator = byId.get(row.owner) ?? unknownAuthor
  let lastEditor: SopAuthorInfo | null = null
  if (row.last_edited_by && row.last_edited_by !== row.owner) {
    lastEditor = byId.get(row.last_edited_by) ?? null
  }
  return {
    creator,
    lastEditor,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
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
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const service = createServiceRoleClient()

    if (sopId) {
      const { data: sop, error: sopError } = await supabase
        .from('sops')
        .select('id, owner, last_edited_by, created_at, updated_at')
        .eq('id', sopId)
        .maybeSingle()

      if (sopError || !sop) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      const row = sop as SopRow
      const need = [row.owner]
      if (row.last_edited_by && row.last_edited_by !== row.owner) need.push(row.last_edited_by)
      const byId = await loadAuthorsById(service, need)
      return NextResponse.json(metaFromRow(row, byId))
    }

    if (sopIdsParam) {
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
      const byId = await loadAuthorsById(service, needIds)

      const metas: Record<string, SopAuthorMeta> = {}
      for (const row of rows) {
        metas[row.id] = metaFromRow(row, byId)
      }

      return NextResponse.json({ authors: metas })
    }

    return NextResponse.json({ error: 'Missing sopId or sopIds' }, { status: 400 })
  } catch (e) {
    console.error('GET /api/sop-author error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
