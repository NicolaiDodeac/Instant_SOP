import { NextResponse } from 'next/server'

/** Standard JSON error body for API routes (clients can branch on `retryable` + optional `code`). */
export type ApiErrorBody = {
  error: string
  retryable: boolean
  code?: string
  /** Optional extra context (e.g. dev-only stack in route handlers). */
  details?: unknown
}

/** Whether clients should treat the failure as worth retrying without changing input. */
export function inferRetryable(status: number): boolean {
  if (status === 408 || status === 425 || status === 429) return true
  if (status >= 500 && status <= 599) return true
  return false
}

export type ApiErrorResponseOptions = {
  code?: string
  /** Overrides {@link inferRetryable} for this status. */
  retryable?: boolean
  details?: unknown
}

export function apiErrorResponse(
  message: string,
  status: number,
  options?: ApiErrorResponseOptions
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: message,
    retryable: options?.retryable ?? inferRetryable(status),
  }
  if (options?.code) body.code = options.code
  if (options?.details !== undefined) body.details = options.details
  return NextResponse.json(body, { status })
}

/**
 * After `await res.json()` on a failed response, interpret the standard error shape.
 * Falls back to HTTP status for `retryable` when the body omits it (older clients / proxies).
 */
export function readApiErrorBody(json: unknown, httpStatus: number): ApiErrorBody | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  if (typeof o.error !== 'string') return null
  return {
    error: o.error,
    retryable: typeof o.retryable === 'boolean' ? o.retryable : inferRetryable(httpStatus),
    code: typeof o.code === 'string' ? o.code : undefined,
    details: 'details' in o ? o.details : undefined,
  }
}
