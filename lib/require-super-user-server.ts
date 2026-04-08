import type { createClientServer } from '@/lib/supabase/server'
import { isSuperUserIdFromEnv } from '@/lib/super-user-env'

type ServerSupabase = Awaited<ReturnType<typeof createClientServer>>

export async function requireSuperUser(supabase: ServerSupabase) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, status: 401 as const, json: { error: 'Unauthorized' } }
  }
  if (isSuperUserIdFromEnv(user.id)) {
    return { ok: true, user } as const
  }
  const { data: superRow } = await supabase
    .from('super_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!superRow) {
    return { ok: false, status: 403 as const, json: { error: 'Forbidden' } }
  }
  return { ok: true, user } as const
}
