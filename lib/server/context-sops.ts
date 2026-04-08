import type { ContextSopsQueryOk } from '@/lib/context-sops-query'
import { getServerAuthSession } from '@/lib/server/auth-session'
import { createClientServer } from '@/lib/supabase/server'
import type { OpsContextSopsPayload, OpsMachineContext, SOP } from '@/lib/types'

type ServerSupabase = Awaited<ReturnType<typeof createClientServer>>

type MachineRow = {
  id: string
  line_leg_id: string
  machine_family_id: string
}

type StationRow = {
  id: string
  station_code: number
  name: string
  section: string
}

async function filterSopIdsByMachineFamily(
  supabase: ServerSupabase,
  sopIds: string[],
  machineFamilyId: string
): Promise<string[]> {
  const uniq = [...new Set(sopIds)]
  if (uniq.length === 0) return []

  const { data } = await supabase
    .from('sop_machine_families')
    .select('sop_id, machine_family_id')
    .in('sop_id', uniq)

  const familyBySop = new Map<string, Set<string>>()
  for (const row of data ?? []) {
    const sopId = String((row as { sop_id: string }).sop_id)
    const famId = String((row as { machine_family_id: string }).machine_family_id)
    const set = familyBySop.get(sopId) ?? new Set<string>()
    set.add(famId)
    familyBySop.set(sopId, set)
  }

  return uniq.filter((id) => {
    const fams = familyBySop.get(id)
    if (!fams) return true
    return fams.has(machineFamilyId)
  })
}

async function loadSopsByIds(supabase: ServerSupabase, ids: string[]): Promise<SOP[]> {
  if (ids.length === 0) return []
  const { data } = await supabase
    .from('sops')
    .select('*')
    .in('id', ids)
    .eq('published', true)
    .not('share_slug', 'is', null)
    .order('updated_at', { ascending: false, nullsFirst: false })
  return (data ?? []) as SOP[]
}

async function runContextSopsQuery(
  supabase: ServerSupabase,
  machine: MachineRow,
  lineId: string | null,
  q: ContextSopsQueryOk
): Promise<OpsContextSopsPayload> {
  const stationCode = q.stationCode
  const stationId = q.stationId
  const trainingModuleId = q.trainingModuleId

  const stationSelect =
    stationCode != null
      ? supabase
          .from('machine_family_stations')
          .select('id, station_code, name, section')
          .eq('machine_family_id', machine.machine_family_id)
          .eq('station_code', stationCode)
          .maybeSingle()
      : stationId
        ? supabase
            .from('machine_family_stations')
            .select('id, station_code, name, section')
            .eq('machine_family_id', machine.machine_family_id)
            .eq('id', stationId)
            .maybeSingle()
        : Promise.resolve({ data: null as StationRow | null })

  const [machineLinks, legLinks, lineLinks, familyLinks, stationRowRes] = await Promise.all([
    supabase.from('sop_machines').select('sop_id').eq('machine_id', machine.id),
    supabase.from('sop_line_legs').select('sop_id').eq('line_leg_id', machine.line_leg_id),
    lineId
      ? supabase.from('sop_lines').select('sop_id').eq('line_id', lineId)
      : Promise.resolve({ data: [] as Array<{ sop_id: string }> }),
    supabase.from('sop_machine_families').select('sop_id').eq('machine_family_id', machine.machine_family_id),
    stationSelect,
  ])

  const resolvedStationId = stationRowRes.data?.id ?? null
  const stationLinks =
    resolvedStationId != null
      ? await supabase
          .from('sop_machine_family_stations')
          .select('sop_id')
          .eq('station_id', resolvedStationId)
      : { data: [] as Array<{ sop_id: string }> }

  const idsMachine = (machineLinks.data ?? []).map((r: { sop_id: string }) => String(r.sop_id))
  const idsLeg = (legLinks.data ?? []).map((r: { sop_id: string }) => String(r.sop_id))
  const idsLine = (lineLinks.data ?? []).map((r: { sop_id: string }) => String(r.sop_id))
  const idsFamily = (familyLinks.data ?? []).map((r: { sop_id: string }) => String(r.sop_id))

  const [idsMachineFiltered, idsLegFiltered, idsLineFiltered] = await Promise.all([
    filterSopIdsByMachineFamily(supabase, idsMachine, machine.machine_family_id),
    filterSopIdsByMachineFamily(supabase, idsLeg, machine.machine_family_id),
    filterSopIdsByMachineFamily(supabase, idsLine, machine.machine_family_id),
  ])

  const stationSopIdSet = new Set((stationLinks.data ?? []).map((r: { sop_id: string }) => String(r.sop_id)))

  function partition(ids: string[]): { station: string[]; general: string[] } {
    if (resolvedStationId == null) return { station: [], general: [...new Set(ids)] }
    const uniq = [...new Set(ids)]
    const station = uniq.filter((id) => stationSopIdSet.has(id))
    const general = uniq.filter((id) => !stationSopIdSet.has(id))
    return { station, general }
  }

  const bucketMachine = partition(idsMachineFiltered)
  const bucketLeg = partition(idsLegFiltered)
  const bucketLine = partition(idsLineFiltered)
  const bucketFamily = partition(idsFamily)

  let moduleSopIdSet: Set<string> | null = null
  let trainingModuleMeta: { id: string; name: string } | null = null
  if (trainingModuleId) {
    const [{ data: modRows }, { data: modRow }] = await Promise.all([
      supabase.from('sop_training_modules').select('sop_id').eq('training_module_id', trainingModuleId),
      supabase.from('training_modules').select('id, name').eq('id', trainingModuleId).maybeSingle(),
    ])
    moduleSopIdSet = new Set((modRows ?? []).map((r: { sop_id: string }) => String(r.sop_id)))
    if (modRow) {
      trainingModuleMeta = {
        id: String((modRow as { id: string }).id),
        name: String((modRow as { name: string }).name),
      }
    }
  }

  function applyTrainingModule(ids: string[]): string[] {
    if (!moduleSopIdSet) return ids
    return ids.filter((id) => moduleSopIdSet!.has(id))
  }

  const [
    machineStation,
    machineGeneral,
    legStation,
    legGeneral,
    lineStation,
    lineGeneral,
    familyStation,
    familyGeneral,
  ] = await Promise.all([
    loadSopsByIds(supabase, applyTrainingModule(bucketMachine.station)),
    loadSopsByIds(supabase, applyTrainingModule(bucketMachine.general)),
    loadSopsByIds(supabase, applyTrainingModule(bucketLeg.station)),
    loadSopsByIds(supabase, applyTrainingModule(bucketLeg.general)),
    loadSopsByIds(supabase, applyTrainingModule(bucketLine.station)),
    loadSopsByIds(supabase, applyTrainingModule(bucketLine.general)),
    loadSopsByIds(supabase, applyTrainingModule(bucketFamily.station)),
    loadSopsByIds(supabase, applyTrainingModule(bucketFamily.general)),
  ])

  return {
    context: {
      machineId: machine.id,
      lineLegId: machine.line_leg_id,
      lineId,
      machineFamilyId: machine.machine_family_id,
      stationCode: stationRowRes.data ? (stationRowRes.data as StationRow).station_code : null,
      stationId: resolvedStationId,
      trainingModuleId,
      trainingModule: trainingModuleMeta,
    },
    station: stationRowRes.data ? (stationRowRes.data as StationRow) : null,
    results: {
      machine: { station: machineStation, general: machineGeneral },
      leg: { station: legStation, general: legGeneral },
      line: { station: lineStation, general: lineGeneral },
      family: { station: familyStation, general: familyGeneral },
    },
  }
}

export async function queryContextSops(
  supabase: ServerSupabase,
  machineId: string,
  q: ContextSopsQueryOk
): Promise<OpsContextSopsPayload | null> {
  const { data: machineRow } = await supabase
    .from('machines')
    .select('id, line_leg_id, machine_family_id')
    .eq('id', machineId)
    .maybeSingle()

  if (!machineRow) {
    return null
  }

  const machine = machineRow as MachineRow

  const { data: legRow } = await supabase
    .from('line_legs')
    .select('id, line_id')
    .eq('id', machine.line_leg_id)
    .maybeSingle()

  const lineId = (legRow as { line_id: string } | null)?.line_id ?? null

  return runContextSopsQuery(supabase, machine, lineId, q)
}

/** Skip machine + leg queries when `OpsMachineContext` is already loaded (ops machine RSC page). */
export async function queryContextSopsFromOpsMachineContext(
  supabase: ServerSupabase,
  ctx: OpsMachineContext,
  q: ContextSopsQueryOk
): Promise<OpsContextSopsPayload> {
  const machine: MachineRow = {
    id: ctx.machine.id,
    line_leg_id: ctx.machine.line_leg_id,
    machine_family_id: ctx.machine.machine_family_id,
  }
  const lineId = ctx.leg?.line_id ?? null
  return runContextSopsQuery(supabase, machine, lineId, q)
}

export async function loadContextSopsForSession(
  machineId: string,
  q: ContextSopsQueryOk
): Promise<
  | { ok: true; data: OpsContextSopsPayload }
  | { ok: false; error: 'unauthorized' | 'not_found' }
> {
  const trimmed = machineId?.trim() ?? ''
  if (!trimmed) {
    return { ok: false, error: 'not_found' }
  }

  const { supabase, user, authError } = await getServerAuthSession()
  if (authError || !user) {
    return { ok: false, error: 'unauthorized' }
  }

  const data = await queryContextSops(supabase, trimmed, q)
  if (!data) {
    return { ok: false, error: 'not_found' }
  }
  return { ok: true, data }
}

export async function loadContextSopsForSessionFromOpsMachineContext(
  ctx: OpsMachineContext,
  q: ContextSopsQueryOk
): Promise<
  | { ok: true; data: OpsContextSopsPayload }
  | { ok: false; error: 'unauthorized' }
> {
  const { supabase, user, authError } = await getServerAuthSession()
  if (authError || !user) {
    return { ok: false, error: 'unauthorized' }
  }

  const data = await queryContextSopsFromOpsMachineContext(supabase, ctx, q)
  return { ok: true, data }
}
