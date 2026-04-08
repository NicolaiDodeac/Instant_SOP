import { getServerAuthSession } from '@/lib/server/auth-session'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { SopRoutingAttachments } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function querySopRoutingAttachments(
  service: SupabaseClient,
  sopId: string
): Promise<SopRoutingAttachments | null> {
  const { data: sop } = await service.from('sops').select('id').eq('id', sopId).maybeSingle()
  if (!sop) return null

  const [modules, families, stations, lines, legs, machines] = await Promise.all([
    service.from('sop_training_modules').select('training_module_id').eq('sop_id', sopId),
    service.from('sop_machine_families').select('machine_family_id').eq('sop_id', sopId),
    service.from('sop_machine_family_stations').select('station_id').eq('sop_id', sopId),
    service.from('sop_lines').select('line_id').eq('sop_id', sopId),
    service.from('sop_line_legs').select('line_leg_id').eq('sop_id', sopId),
    service.from('sop_machines').select('machine_id').eq('sop_id', sopId),
  ])

  return {
    trainingModuleIds: (modules.data ?? []).map((r: { training_module_id: string }) =>
      String(r.training_module_id)
    ),
    machineFamilyIds: (families.data ?? []).map((r: { machine_family_id: string }) =>
      String(r.machine_family_id)
    ),
    stationIds: (stations.data ?? []).map((r: { station_id: string }) => String(r.station_id)),
    lineIds: (lines.data ?? []).map((r: { line_id: string }) => String(r.line_id)),
    lineLegIds: (legs.data ?? []).map((r: { line_leg_id: string }) => String(r.line_leg_id)),
    machineIds: (machines.data ?? []).map((r: { machine_id: string }) => String(r.machine_id)),
  }
}

export async function loadSopRoutingAttachmentsForSession(
  sopId: string
): Promise<
  | { ok: true; data: SopRoutingAttachments }
  | { ok: false; error: 'unauthorized' | 'not_found' }
> {
  const { user, authError } = await getServerAuthSession()
  if (authError || !user) {
    return { ok: false, error: 'unauthorized' }
  }

  const service = createServiceRoleClient()
  const data = await querySopRoutingAttachments(service, sopId)
  if (!data) {
    return { ok: false, error: 'not_found' }
  }
  return { ok: true, data }
}
