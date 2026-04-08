/**
 * Optional bootstrap list: SUPER_USER_ID may be one UUID or several comma-separated.
 * Prefer rows in table `super_users` for production; env is useful for local / emergency access.
 */
export function parseSuperUserIdsFromEnv(): string[] {
  const raw = process.env.SUPER_USER_ID?.trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function isSuperUserIdFromEnv(userId: string): boolean {
  if (!userId) return false
  return new Set(parseSuperUserIdsFromEnv()).has(userId)
}
