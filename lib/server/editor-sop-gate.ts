import { resolveEditorFlags } from '@/lib/auth/resolve-editor-flags'
import { getServerAuthSession } from '@/lib/server/auth-session'

/** DB SOP ids are UUIDs; local-only drafts may use nanoid. */
export const EDITOR_DB_SOP_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type EditorSopGateOk = {
  userId: string
  isSuperUser: boolean
  /** Present when `sopId` is a DB UUID; `null` if row missing. Omitted for non-UUID ids. */
  sopOwnerId?: string | null
}

export async function loadEditorSopGate(sopId: string): Promise<
  | { ok: true; data: EditorSopGateOk }
  | { ok: false; error: 'unauthorized' | 'not_editor' | 'forbidden' }
> {
  const { supabase, user, authError } = await getServerAuthSession()

  if (authError || !user) {
    return { ok: false, error: 'unauthorized' }
  }

  const { isEditor, isSuperUser } = await resolveEditorFlags(supabase, user.id)
  if (!isEditor) {
    return { ok: false, error: 'not_editor' }
  }

  if (EDITOR_DB_SOP_ID_RE.test(sopId)) {
    const { data: row } = await supabase.from('sops').select('owner').eq('id', sopId).maybeSingle()
    if (row?.owner != null && !isSuperUser && row.owner !== user.id) {
      return { ok: false, error: 'forbidden' }
    }
    return {
      ok: true,
      data: { userId: user.id, isSuperUser, sopOwnerId: row?.owner != null ? String(row.owner) : null },
    }
  }

  return { ok: true, data: { userId: user.id, isSuperUser } }
}
