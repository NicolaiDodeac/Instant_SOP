import type { MachineFamily } from '@/lib/types'

/**
 * Family display name with optional supplier in parentheses, e.g. `Wrapper (Stampac)`.
 * If `name` already ends with the same supplier in parens (seed data often has both), do not append again.
 */
export function formatMachineFamilyLabel(
  f: Pick<MachineFamily, 'name'> & { supplier?: string | null } | null | undefined
): string {
  if (!f?.name) return '—'
  const name = f.name.trim()
  const s = typeof f.supplier === 'string' ? f.supplier.trim() : ''
  if (!s) return name

  const suffix = ` (${s})`
  const nameLow = name.toLowerCase()
  const suffixLow = suffix.toLowerCase()
  if (nameLow.endsWith(suffixLow)) {
    return name
  }

  return `${name} (${s})`
}
