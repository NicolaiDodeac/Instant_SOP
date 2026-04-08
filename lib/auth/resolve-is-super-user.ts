import type { SupabaseClient } from '@supabase/supabase-js'
import { isSuperUserIdFromEnv } from '@/lib/super-user-env'

/**
 * Super user = id in env allowlist OR row in `super_users`.
 * Works with user-scoped or service-role clients (use whichever can read `super_users` under your RLS).
 * Env is checked first to skip a DB round-trip when already privileged.
 * If `super_users` is missing or the query throws, only env applies (matches legacy `resolveEditorFlags` tolerance).
 */
export async function resolveIsSuperUser(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (isSuperUserIdFromEnv(userId)) return true
  try {
    const { data: superRow } = await supabase
      .from('super_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    return !!superRow
  } catch {
    return false
  }
}
