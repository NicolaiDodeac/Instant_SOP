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

type SopMetaRow = {
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

export async function loadAuthorsById(
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

export function metaFromSopRow(row: SopMetaRow, byId: Map<string, SopAuthorInfo>): SopAuthorMeta {
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

export async function loadSopAuthorMetaForViewer(sopId: string): Promise<SopAuthorMeta | null> {
  const supabase = await createClientServer()
  const { data: sop, error } = await supabase
    .from('sops')
    .select('id, owner, last_edited_by, created_at, updated_at')
    .eq('id', sopId)
    .maybeSingle()

  if (error || !sop) return null

  const row = sop as SopMetaRow
  const service = createServiceRoleClient()
  const need = [row.owner]
  if (row.last_edited_by && row.last_edited_by !== row.owner) need.push(row.last_edited_by)
  const byId = await loadAuthorsById(service, need)
  return metaFromSopRow(row, byId)
}
