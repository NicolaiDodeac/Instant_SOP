import type { ZodError } from 'zod'

/** First human-readable message from a Zod error (for alerts / toast). */
export function zodFirstIssueMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid data'
}
