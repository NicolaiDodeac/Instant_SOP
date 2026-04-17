import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { loadOpsMachineContextForSession } from '@/lib/server/context-machine'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  try {
    const machineId = request.nextUrl.searchParams.get('machineId')
    if (!machineId) {
      return apiErrorResponse('Missing machineId', 400, { retryable: false })
    }

    const parsedMachineId = z.string().uuid().safeParse(machineId)
    if (!parsedMachineId.success) {
      return apiErrorResponse('Invalid machineId', 400, { retryable: false })
    }

    const result = await loadOpsMachineContextForSession(parsedMachineId.data)
    if (!result.ok) {
      if (result.error === 'unauthorized') {
        return apiErrorResponse('Unauthorized', 401, { retryable: false })
      }
      if (result.error === 'bad_request') {
        return apiErrorResponse('Missing machineId', 400, { retryable: false })
      }
      return apiErrorResponse('Machine not found', 404, { retryable: false })
    }

    return NextResponse.json(result.data)
  } catch (err) {
    console.error('GET /api/context/machine error:', err)
    return apiErrorResponse('Internal server error', 500)
  }
}
