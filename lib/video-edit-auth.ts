/** Match DB step ids (uuid); draft steps use nanoid. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(id: string): boolean {
  return UUID_REGEX.test(id)
}

/**
 * R2 keys are `uploaderId/sopId/stepId/file`. Allow when uploader is the caller, or when a super user
 * addresses the owner's object (same prefix as sop.owner).
 */
export function isAuthorizedVideoPath(
  path: string,
  userId: string,
  sopId: string,
  sopOwnerId: string,
  isSuperUser: boolean
): boolean {
  if (!path || path.includes('..') || !path.includes('/')) return false
  const parts = path.split('/')
  if (parts.length < 4) return false
  if (parts[1] !== sopId) return false
  if (parts[0] === userId) return true
  if (isSuperUser && parts[0] === sopOwnerId) return true
  return false
}
