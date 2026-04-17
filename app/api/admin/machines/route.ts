import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'
import type { Line, LineLeg, Machine, MachineFamily } from '@/lib/types'
import { adminCreateMachineBodySchema } from '@/lib/validation/admin'

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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiErrorResponse('Invalid JSON', 400, { retryable: false })
  }

  const parsed = adminCreateMachineBodySchema.safeParse(body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const message =
      flat.fieldErrors.line_leg_id?.[0] ??
      flat.fieldErrors.machine_family_id?.[0] ??
      flat.fieldErrors.name?.[0] ??
      flat.fieldErrors.code?.[0] ??
      'Invalid request'
    return apiErrorResponse(message, 400, { retryable: false })
  }

  const { line_leg_id, machine_family_id, name, code } = parsed.data

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
      return apiErrorResponse(
        'A machine with this name already exists on that leg.',
        409,
        { retryable: false }
      )
    }
    return apiErrorResponse(insertError.message, 500)
  }

  return NextResponse.json({ machine: inserted })
}
