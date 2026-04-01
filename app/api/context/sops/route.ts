import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'
import type { SOP } from '@/lib/types'

type MachineRow = {
  id: string
  line_leg_id: string
  machine_family_id: string
}

type LegRow = {
  id: string
  line_id: string
}

type StationRow = {
  id: string
  station_code: number
  name: string
  section: string
}

async function filterSopIdsByMachineFamily(
  supabase: Awaited<ReturnType<typeof createClientServer>>,
  sopIds: string[],
  machineFamilyId: string
): Promise<string[]> {
  const uniq = [...new Set(sopIds)]
  if (uniq.length === 0) return []

  // If a SOP has machine-family tags, only include it when it matches current family.
  // If it has NO machine-family tags, treat it as "general" and include it.
  const { data } = await supabase
    .from('sop_machine_families')
    .select('sop_id, machine_family_id')
    .in('sop_id', uniq)

  const familyBySop = new Map<string, Set<string>>()
  for (const row of data ?? []) {
    const sopId = String((row as any).sop_id)
    const famId = String((row as any).machine_family_id)
    const set = familyBySop.get(sopId) ?? new Set<string>()
    set.add(famId)
    familyBySop.set(sopId, set)
  }

  return uniq.filter((id) => {
    const fams = familyBySop.get(id)
    if (!fams) return true // no family tag => general
    return fams.has(machineFamilyId)
  })
}

async function loadSopsByIds(
  supabase: Awaited<ReturnType<typeof createClientServer>>,
  ids: string[]
): Promise<SOP[]> {
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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const machineId = request.nextUrl.searchParams.get('machineId')
    const stationCodeRaw = request.nextUrl.searchParams.get('stationCode')
    if (!machineId) {
      return NextResponse.json({ error: 'Missing machineId' }, { status: 400 })
    }

    const stationCode = stationCodeRaw != null && stationCodeRaw.trim() !== '' ? Number(stationCodeRaw) : null
    if (stationCodeRaw && (stationCode == null || Number.isNaN(stationCode))) {
      return NextResponse.json({ error: 'Invalid stationCode' }, { status: 400 })
    }

    const { data: machineRow } = await supabase
      .from('machines')
      .select('id, line_leg_id, machine_family_id')
      .eq('id', machineId)
      .maybeSingle()

    if (!machineRow) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 })
    }

    const machine = machineRow as MachineRow

    const { data: legRow } = await supabase
      .from('line_legs')
      .select('id, line_id')
      .eq('id', machine.line_leg_id)
      .maybeSingle()

    const leg = (legRow ?? null) as LegRow | null
    const lineId = leg?.line_id ?? null

    // Attachment lookups (ids only, then hydrate SOPs).
    const [
      machineLinks,
      legLinks,
      lineLinks,
      familyLinks,
      stationRowRes,
      stationLinks,
    ] = await Promise.all([
      supabase.from('sop_machines').select('sop_id').eq('machine_id', machine.id),
      supabase.from('sop_line_legs').select('sop_id').eq('line_leg_id', machine.line_leg_id),
      lineId
        ? supabase.from('sop_lines').select('sop_id').eq('line_id', lineId)
        : Promise.resolve({ data: [] as Array<{ sop_id: string }> }),
      supabase.from('sop_machine_families').select('sop_id').eq('machine_family_id', machine.machine_family_id),
      stationCode != null
        ? supabase
            .from('machine_family_stations')
            .select('id, station_code, name, section')
            .eq('machine_family_id', machine.machine_family_id)
            .eq('station_code', stationCode)
            .maybeSingle()
        : Promise.resolve({ data: null as StationRow | null }),
      stationCode != null
        ? (async () => {
            const st = await supabase
              .from('machine_family_stations')
              .select('id')
              .eq('machine_family_id', machine.machine_family_id)
              .eq('station_code', stationCode)
              .maybeSingle()
            if (!st.data?.id) return { data: [] as Array<{ sop_id: string }> }
            return supabase.from('sop_machine_family_stations').select('sop_id').eq('station_id', st.data.id)
          })()
        : Promise.resolve({ data: [] as Array<{ sop_id: string }> }),
    ])

    const idsMachine = (machineLinks.data ?? []).map((r: any) => String(r.sop_id))
    const idsLeg = (legLinks.data ?? []).map((r: any) => String(r.sop_id))
    const idsLine = (lineLinks.data ?? []).map((r: any) => String(r.sop_id))
    const idsFamily = (familyLinks.data ?? []).map((r: any) => String(r.sop_id))

    // Prevent machine-specific views from showing unrelated line/leg SOPs:
    // line/leg/machine attachments are included only when they match this machine family,
    // unless they have no machine-family tag (true general SOP).
    const [idsMachineFiltered, idsLegFiltered, idsLineFiltered] = await Promise.all([
      filterSopIdsByMachineFamily(supabase, idsMachine, machine.machine_family_id),
      filterSopIdsByMachineFamily(supabase, idsLeg, machine.machine_family_id),
      filterSopIdsByMachineFamily(supabase, idsLine, machine.machine_family_id),
    ])

    const stationSopIdSet = new Set((stationLinks.data ?? []).map((r: any) => String(r.sop_id)))

    function partition(ids: string[]): { station: string[]; general: string[] } {
      if (stationCode == null) return { station: [], general: [...new Set(ids)] }
      const uniq = [...new Set(ids)]
      const station = uniq.filter((id) => stationSopIdSet.has(id))
      const general = uniq.filter((id) => !stationSopIdSet.has(id))
      return { station, general }
    }

    const bucketMachine = partition(idsMachineFiltered)
    const bucketLeg = partition(idsLegFiltered)
    const bucketLine = partition(idsLineFiltered)
    const bucketFamily = partition(idsFamily)

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
      loadSopsByIds(supabase, bucketMachine.station),
      loadSopsByIds(supabase, bucketMachine.general),
      loadSopsByIds(supabase, bucketLeg.station),
      loadSopsByIds(supabase, bucketLeg.general),
      loadSopsByIds(supabase, bucketLine.station),
      loadSopsByIds(supabase, bucketLine.general),
      loadSopsByIds(supabase, bucketFamily.station),
      loadSopsByIds(supabase, bucketFamily.general),
    ])

    return NextResponse.json({
      context: {
        machineId: machine.id,
        lineLegId: machine.line_leg_id,
        lineId,
        machineFamilyId: machine.machine_family_id,
        stationCode,
      },
      station: stationRowRes.data ? (stationRowRes.data as StationRow) : null,
      results: {
        machine: { station: machineStation, general: machineGeneral },
        leg: { station: legStation, general: legGeneral },
        line: { station: lineStation, general: lineGeneral },
        family: { station: familyStation, general: familyGeneral },
      },
    })
  } catch (err) {
    console.error('GET /api/context/sops error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

