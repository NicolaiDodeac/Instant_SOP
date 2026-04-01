import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'
import type { Line, LineLeg, Machine, MachineFamily, MachineFamilyStation } from '@/lib/types'

type MachineWithFamily = Machine & { machine_families?: MachineFamily | null }
type LegRow = LineLeg & { lines?: Line | null }

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
    if (!machineId) {
      return NextResponse.json({ error: 'Missing machineId' }, { status: 400 })
    }

    const { data: machineRow, error: machineError } = await supabase
      .from('machines')
      .select('*, machine_families(*)')
      .eq('id', machineId)
      .single()

    if (machineError || !machineRow) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 })
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

    return NextResponse.json({
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
    })
  } catch (err) {
    console.error('GET /api/context/machine error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

