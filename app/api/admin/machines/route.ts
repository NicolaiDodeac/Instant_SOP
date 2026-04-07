import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'
import type { Line, LineLeg, Machine, MachineFamily } from '@/lib/types'

type MachineRow = Machine & { machine_families?: MachineFamily | null }

function buildTree(
  lines: Line[],
  legs: LineLeg[],
  machines: MachineRow[]
) {
  const legsByLine = new Map<string, LineLeg[]>()
  for (const leg of legs) {
    const list = legsByLine.get(leg.line_id) ?? []
    list.push(leg)
    legsByLine.set(leg.line_id, list)
  }

  const machinesByLeg = new Map<string, Machine[]>()
  for (const m of machines) {
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

  return lines.map((line) => {
    const lineLegs = (legsByLine.get(line.id) ?? []).map((leg) => ({
      ...leg,
      machines: machinesByLeg.get(leg.id) ?? [],
    }))
    return { ...line, legs: lineLegs }
  })
}

export async function GET() {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const service = createServiceRoleClient()
  const [{ data: lines }, { data: legs }, { data: machines }, { data: families }] = await Promise.all([
    service.from('lines').select('*').order('name', { ascending: true }),
    service.from('line_legs').select('*').order('name', { ascending: true }),
    service.from('machines').select('*, machine_families(*)').order('name', { ascending: true }),
    service.from('machine_families').select('*').order('name', { ascending: true }),
  ])

  const tree = buildTree(
    (lines ?? []) as Line[],
    (legs ?? []) as LineLeg[],
    (machines ?? []) as MachineRow[]
  )

  return NextResponse.json({
    lines: tree,
    machineFamilies: (families ?? []) as MachineFamily[],
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  let body: {
    line_leg_id?: string
    machine_family_id?: string
    name?: string
    code?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const line_leg_id = typeof body.line_leg_id === 'string' ? body.line_leg_id.trim() : ''
  const machine_family_id =
    typeof body.machine_family_id === 'string' ? body.machine_family_id.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const code =
    body.code === null || body.code === undefined
      ? null
      : typeof body.code === 'string'
        ? body.code.trim() || null
        : null

  if (!line_leg_id || !machine_family_id || !name) {
    return NextResponse.json(
      { error: 'Missing line_leg_id, machine_family_id, or name' },
      { status: 400 }
    )
  }

  const service = createServiceRoleClient()
  const { data: inserted, error: insertError } = await service
    .from('machines')
    .insert({
      line_leg_id,
      machine_family_id,
      name,
      code,
      active: true,
    })
    .select('*, machine_families(*)')
    .maybeSingle()

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'A machine with this name already exists on that leg.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ machine: inserted })
}
