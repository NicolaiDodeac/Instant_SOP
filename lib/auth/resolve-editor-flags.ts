import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'

/** Shared by `/api/user/me` and `/api/editor/sops` so editor rules stay in one place. */
export async function resolveEditorFlags(supabase: SupabaseClient, userId: string) {
  const { data: editorRow } = await supabase
    .from('allowed_editors')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  const isSuperUser = await resolveIsSuperUser(supabase, userId)
  const isEditor = !!editorRow || isSuperUser
  return { isEditor, isSuperUser }
}
