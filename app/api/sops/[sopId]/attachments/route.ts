import { NextRequest, NextResponse } from 'next/server'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'

type Attachments = {
  trainingModuleIds: string[]
  machineFamilyIds: string[]
  stationIds: string[]
  lineIds: string[]
  lineLegIds: string[]
  machineIds: string[]
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sopId: string }> }
) {
  try {
    const { sopId } = await params
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const service = createServiceRoleClient()
    const { data: sop } = await service.from('sops').select('id').eq('id', sopId).maybeSingle()
    if (!sop) return NextResponse.json({ error: 'SOP not found' }, { status: 404 })

    const [
      modules,
      families,
      stations,
      lines,
      legs,
      machines,
    ] = await Promise.all([
      service.from('sop_training_modules').select('training_module_id').eq('sop_id', sopId),
      service.from('sop_machine_families').select('machine_family_id').eq('sop_id', sopId),
      service.from('sop_machine_family_stations').select('station_id').eq('sop_id', sopId),
      service.from('sop_lines').select('line_id').eq('sop_id', sopId),
      service.from('sop_line_legs').select('line_leg_id').eq('sop_id', sopId),
      service.from('sop_machines').select('machine_id').eq('sop_id', sopId),
    ])

    const payload: Attachments = {
      trainingModuleIds: (modules.data ?? []).map((r: any) => String(r.training_module_id)),
      machineFamilyIds: (families.data ?? []).map((r: any) => String(r.machine_family_id)),
      stationIds: (stations.data ?? []).map((r: any) => String(r.station_id)),
      lineIds: (lines.data ?? []).map((r: any) => String(r.line_id)),
      lineLegIds: (legs.data ?? []).map((r: any) => String(r.line_leg_id)),
      machineIds: (machines.data ?? []).map((r: any) => String(r.machine_id)),
    }

    return NextResponse.json(payload)
  } catch (err) {
    console.error('GET /api/sops/[sopId]/attachments error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sopId: string }> }
) {
  try {
    const { sopId } = await params
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as Partial<Attachments>
    const next: Attachments = {
      trainingModuleIds: body.trainingModuleIds ?? [],
      machineFamilyIds: body.machineFamilyIds ?? [],
      stationIds: body.stationIds ?? [],
      lineIds: body.lineIds ?? [],
      lineLegIds: body.lineLegIds ?? [],
      machineIds: body.machineIds ?? [],
    }

    const service = createServiceRoleClient()
    const { data: sop } = await service.from('sops').select('owner').eq('id', sopId).single()
    if (!sop) return NextResponse.json({ error: 'SOP not found' }, { status: 404 })

    const ownerId = String((sop as any).owner)
    const superUser = await resolveIsSuperUser(service, user.id)
    const canEdit = ownerId === user.id || superUser
    if (!canEdit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Replace-all strategy (simple + predictable).
    await Promise.all([
      service.from('sop_training_modules').delete().eq('sop_id', sopId),
      service.from('sop_machine_families').delete().eq('sop_id', sopId),
      service.from('sop_machine_family_stations').delete().eq('sop_id', sopId),
      service.from('sop_lines').delete().eq('sop_id', sopId),
      service.from('sop_line_legs').delete().eq('sop_id', sopId),
      service.from('sop_machines').delete().eq('sop_id', sopId),
    ])

    if (next.trainingModuleIds.length > 0) {
      await service.from('sop_training_modules').insert(
        next.trainingModuleIds.map((id) => ({ sop_id: sopId, training_module_id: id }))
      )
    }
    if (next.machineFamilyIds.length > 0) {
      await service.from('sop_machine_families').insert(
        next.machineFamilyIds.map((id) => ({ sop_id: sopId, machine_family_id: id }))
      )
    }
    if (next.stationIds.length > 0) {
      await service.from('sop_machine_family_stations').insert(
        next.stationIds.map((id) => ({ sop_id: sopId, station_id: id }))
      )
    }
    if (next.lineIds.length > 0) {
      await service.from('sop_lines').insert(next.lineIds.map((id) => ({ sop_id: sopId, line_id: id })))
    }
    if (next.lineLegIds.length > 0) {
      await service
        .from('sop_line_legs')
        .insert(next.lineLegIds.map((id) => ({ sop_id: sopId, line_leg_id: id })))
    }
    if (next.machineIds.length > 0) {
      await service
        .from('sop_machines')
        .insert(next.machineIds.map((id) => ({ sop_id: sopId, machine_id: id })))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PUT /api/sops/[sopId]/attachments error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

