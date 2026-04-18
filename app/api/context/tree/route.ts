import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { getContextTreeForSession } from '@/lib/server/context-tree'

export async function GET() {
  try {
    const result = await getContextTreeForSession()
    if (!result.ok) {
      return apiErrorResponse('Unauthorized', 401, { retryable: false })
    }
    return NextResponse.json(result.data)
  } catch (err) {
    console.error('GET /api/context/tree error:', err)
    return apiErrorResponse('Internal server error', 500)
  }
}
