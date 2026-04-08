import { resolveEditorFlags } from '@/lib/auth/resolve-editor-flags'
import { getServerAuthSession } from '@/lib/server/auth-session'
import type { TrainingModule } from '@/lib/types'

export type DashboardBootstrap = {
  isEditor: boolean
  isSuperUser: boolean
  trainingModules: TrainingModule[]
}

export async function loadDashboardBootstrap(): Promise<
  | { ok: true; data: DashboardBootstrap }
  | { ok: false; error: 'unauthorized' }
> {
  const { supabase, user, authError } = await getServerAuthSession()

  if (authError || !user) {
    return { ok: false, error: 'unauthorized' }
  }

  const [{ isEditor, isSuperUser }, { data: modules, error: modError }] = await Promise.all([
    resolveEditorFlags(supabase, user.id),
    supabase.from('training_modules').select('*').order('name', { ascending: true }),
  ])

  if (modError) {
    console.error('dashboard bootstrap training_modules:', modError)
  }

  const trainingModules = (modules ?? []).filter((m) => m.active !== false) as TrainingModule[]

  return { ok: true, data: { isEditor, isSuperUser, trainingModules } }
}
