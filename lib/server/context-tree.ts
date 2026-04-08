import { cache } from 'react'
import { getServerAuthSession } from '@/lib/server/auth-session'
import type {
  ContextTreeLine,
  ContextTreePayload,
  Line,
  LineLeg,
  Machine,
  MachineFamily,
  TrainingModule,
} from '@/lib/types'

type MachineRow = Machine & { machine_families?: MachineFamily | null }

export type { ContextTreeLine, ContextTreePayload } from '@/lib/types'

type ServerSupabase = Awaited<
  ReturnType<typeof getServerAuthSession>
>['supabase']

export async function queryContextTree(supabase: ServerSupabase): Promise<ContextTreePayload> {
  const [{ data: lines }, { data: legs }, { data: machines }, { data: families }, { data: modules }] =
    await Promise.all([
      supabase.from('lines').select('*').order('name', { ascending: true }),
      supabase.from('line_legs').select('*').order('name', { ascending: true }),
      supabase
        .from('machines')
        .select('*, machine_families(*)')
        .order('name', { ascending: true }),
      supabase.from('machine_families').select('*').order('name', { ascending: true }),
      supabase.from('training_modules').select('*').order('name', { ascending: true }),
    ])

  const safeLines = (lines ?? []) as Line[]
  const safeLegs = (legs ?? []) as LineLeg[]
  const safeMachines = (machines ?? []) as MachineRow[]

  const legsByLine = new Map<string, LineLeg[]>()
  for (const leg of safeLegs) {
    const list = legsByLine.get(leg.line_id) ?? []
    list.push(leg)
    legsByLine.set(leg.line_id, list)
  }

  const machinesByLeg = new Map<string, Machine[]>()
  for (const m of safeMachines) {
    const mm: Machine = {
      id: m.id,
      line_leg_id: m.line_leg_id,
      machine_family_id: m.machine_family_id,
      code: m.code,
      name: m.name,
      active: m.active,
      machine_family: m.machine_families ?? undefined,
    }
    const list = machinesByLeg.get(mm.line_leg_id) ?? []
    list.push(mm)
    machinesByLeg.set(mm.line_leg_id, list)
  }

  const tree: ContextTreeLine[] = safeLines.map((line) => {
    const lineLegs = (legsByLine.get(line.id) ?? []).map((leg) => ({
      ...leg,
      machines: machinesByLeg.get(leg.id) ?? [],
    }))
    return { ...line, legs: lineLegs }
  })

  return {
    lines: tree,
    machineFamilies: (families ?? []) as MachineFamily[],
    trainingModules: (modules ?? []) as TrainingModule[],
  }
}

export type LoadContextTreeResult =
  | { ok: true; data: ContextTreePayload }
  | { ok: false; error: 'unauthorized' }

export async function loadContextTreeForSession(): Promise<LoadContextTreeResult> {
  const { supabase, user, authError } = await getServerAuthSession()

  if (authError || !user) {
    return { ok: false, error: 'unauthorized' }
  }

  const data = await queryContextTree(supabase)
  return { ok: true, data }
}

/** Dedupes context-tree work when the same request loads it from a page and an API route. */
export const getContextTreeForSession = cache(loadContextTreeForSession)
