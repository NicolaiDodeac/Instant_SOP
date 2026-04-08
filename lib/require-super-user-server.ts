import type { createClientServer } from '@/lib/supabase/server'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'

type ServerSupabase = Awaited<ReturnType<typeof createClientServer>>

export async function requireSuperUser(supabase: ServerSupabase) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, status: 401 as const, json: { error: 'Unauthorized' } }
  }
  if (await resolveIsSuperUser(supabase, user.id)) {
    return { ok: true, user } as const
  }
  return { ok: false, status: 403 as const, json: { error: 'Forbidden' } }
}
