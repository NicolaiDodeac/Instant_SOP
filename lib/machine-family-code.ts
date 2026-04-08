const MAX_CODE_LENGTH = 180

/**
 * One upper-snake segment derived from user-visible text (name or supplier).
 */
export function slugifyMachineFamilySegment(input: string): string {
  const s = input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return s.toUpperCase()
}

/**
 * Builds the base machine family `code` before uniqueness suffixing.
 * Matches server behavior for POST /api/admin/machine-families when `code` is omitted.
 */
export function buildMachineFamilyCodeBase(
  name: string,
  supplier: string | null | undefined
): string {
  const a = slugifyMachineFamilySegment((name ?? '').trim())
  const b =
    supplier != null && String(supplier).trim()
      ? slugifyMachineFamilySegment(String(supplier).trim())
      : ''
  let out = ''
  if (a && b) out = `${a}_${b}`
  else if (a) out = a
  else if (b) out = b
  if (out.length > MAX_CODE_LENGTH) out = out.slice(0, MAX_CODE_LENGTH)
  return out
}

export function truncateMachineFamilyCode(code: string): string {
  if (code.length <= MAX_CODE_LENGTH) return code
  return code.slice(0, MAX_CODE_LENGTH)
}
