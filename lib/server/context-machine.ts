import { getServerAuthSession } from '@/lib/server/auth-session'
import { createClientServer } from '@/lib/supabase/server'
import type { Line, LineLeg, Machine, MachineFamily, MachineFamilyStation, OpsMachineContext } from '@/lib/types'

type ServerSupabase = Awaited<ReturnType<typeof createClientServer>>

type MachineWithFamily = Machine & { machine_families?: MachineFamily | null }
type LegRow = LineLeg & { lines?: Line | null }

export async function queryOpsMachineContext(
  supabase: ServerSupabase,
  machineId: string
): Promise<OpsMachineContext | null> {
  const { data: machineRow, error: machineError } = await supabase
    .from('machines')
    .select('*, machine_families(*)')
    .eq('id', machineId)
    .single()

  if (machineError || !machineRow) {
    return null
  }

  const machine = machineRow as MachineWithFamily

  const { data: legRow } = await supabase
    .from('line_legs')
    .select('*, lines(*)')
    .eq('id', machine.line_leg_id)
    .maybeSingle()

  const leg = (legRow ?? null) as LegRow | null

  const familyId = machine.machine_family_id
  const { data: stations } = await supabase
    .from('machine_family_stations')
    .select('*')
    .eq('machine_family_id', familyId)
    .eq('active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('station_code', { ascending: true })

  const stationRows = (stations ?? []) as MachineFamilyStation[]
  const bySection: Record<string, MachineFamilyStation[]> = {}
  for (const s of stationRows) {
    const key = s.section || 'Other'
    bySection[key] = bySection[key] ?? []
    bySection[key].push(s)
  }

  return {
    machine: {
      id: machine.id,
      name: machine.name,
      code: machine.code ?? null,
      line_leg_id: machine.line_leg_id,
      machine_family_id: machine.machine_family_id,
      machine_family: machine.machine_families ?? null,
    },
    leg: leg
      ? { id: leg.id, code: leg.code, name: leg.name, line_id: leg.line_id, line: leg.lines ?? null }
      : null,
    stationsBySection: bySection,
  }
}

export async function loadOpsMachineContextForSession(
  machineId: string
): Promise<
  | { ok: true; data: OpsMachineContext }
  | { ok: false; error: 'unauthorized' | 'bad_request' | 'not_found' }
> {
  const trimmed = machineId?.trim() ?? ''
  if (!trimmed) {
    return { ok: false, error: 'bad_request' }
  }

  const { supabase, user, authError } = await getServerAuthSession()
  if (authError || !user) {
    return { ok: false, error: 'unauthorized' }
  }

  const data = await queryOpsMachineContext(supabase, trimmed)
  if (!data) {
    return { ok: false, error: 'not_found' }
  }
  return { ok: true, data }
}
