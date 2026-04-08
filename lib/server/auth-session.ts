import { cache } from 'react'
import { createClientServer } from '@/lib/supabase/server'
import type { AuthError, User } from '@supabase/supabase-js'

type ServerSupabase = Awaited<ReturnType<typeof createClientServer>>

export type ServerAuthSession = {
  supabase: ServerSupabase
  user: User | null
  authError: AuthError | null
}

/**
 * One Supabase server client + valid getUser() per React request (layout + page loaders).
 */
export const getServerAuthSession = cache(async (): Promise<ServerAuthSession> => {
  const supabase = await createClientServer()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  return { supabase, user: user ?? null, authError }
})
