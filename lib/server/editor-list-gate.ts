import { resolveEditorFlags } from '@/lib/auth/resolve-editor-flags'
import { getServerAuthSession } from '@/lib/server/auth-session'

export type EditorListGateOk = {
  userId: string
  isSuperUser: boolean
}

export async function loadEditorListGate(): Promise<
  | { ok: true; data: EditorListGateOk }
  | { ok: false; error: 'unauthorized' | 'not_editor' }
> {
  const { supabase, user, authError } = await getServerAuthSession()

  if (authError || !user) {
    return { ok: false, error: 'unauthorized' }
  }

  const { isEditor, isSuperUser } = await resolveEditorFlags(supabase, user.id)
  if (!isEditor) {
    return { ok: false, error: 'not_editor' }
  }

  return { ok: true, data: { userId: user.id, isSuperUser } }
}
