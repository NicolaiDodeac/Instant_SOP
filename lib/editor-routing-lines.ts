import type { ContextTreeLine, Line, LineLeg } from '@/lib/types'

export function routingKeyFromIds(ids: {
  trainingModuleIds?: string[]
  machineFamilyIds?: string[]
  stationIds?: string[]
  lineIds?: string[]
  lineLegIds?: string[]
}): string {
  const norm = (v?: string[]) => (v ?? []).slice().sort().join(',')
  return [
    `tm:${norm(ids.trainingModuleIds)}`,
    `mf:${norm(ids.machineFamilyIds)}`,
    `st:${norm(ids.stationIds)}`,
    `ln:${norm(ids.lineIds)}`,
    `lg:${norm(ids.lineLegIds)}`,
  ].join('|')
}

/** Strips nested machines from context tree legs (editor routing pickers only need line → leg). */
export function linesTreeForEditorRouting(
  lines: ContextTreeLine[]
): Array<Line & { legs: LineLeg[] }> {
  return lines.map((l) => ({
    id: l.id,
    code: l.code ?? null,
    name: l.name,
    active: l.active,
    legs: (l.legs ?? []).map((leg) => ({
      id: leg.id,
      line_id: leg.line_id,
      code: leg.code,
      name: leg.name,
      active: leg.active,
    })),
  }))
}
