import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
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

function authorFromUser(u: User) {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const email = u.email ?? undefined
  return {
    displayName: pickDisplayName(meta, email),
    email: u.email ?? null,
    avatarUrl: pickAvatarUrl(meta),
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
        .select('id, owner')
        .eq('id', sopId)
        .maybeSingle()

      if (sopError || !sop) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      const { data: ownerData, error: ownerError } = await service.auth.admin.getUserById(sop.owner)
      if (ownerError || !ownerData?.user) {
        return NextResponse.json({ error: 'Owner not found' }, { status: 404 })
      }

      return NextResponse.json(authorFromUser(ownerData.user))
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
        .select('id, owner')
        .in('id', ids)

      if (sopsError || !sops?.length) {
        return NextResponse.json({ authors: {} })
      }

      const ownerBySop = new Map<string, string>()
      const uniqueOwners = new Set<string>()
      for (const row of sops) {
        ownerBySop.set(row.id, row.owner)
        uniqueOwners.add(row.owner)
      }

      const authorByOwnerId = new Map<string, ReturnType<typeof authorFromUser>>()
      for (const ownerId of uniqueOwners) {
        const { data: ownerData } = await service.auth.admin.getUserById(ownerId)
        if (ownerData?.user) {
          authorByOwnerId.set(ownerId, authorFromUser(ownerData.user))
        }
      }

      const authors: Record<string, ReturnType<typeof authorFromUser>> = {}
      for (const [sid, oid] of ownerBySop) {
        const a = authorByOwnerId.get(oid)
        if (a) authors[sid] = a
      }

      return NextResponse.json({ authors })
    }

    return NextResponse.json({ error: 'Missing sopId or sopIds' }, { status: 400 })
  } catch (e) {
    console.error('GET /api/sop-author error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
