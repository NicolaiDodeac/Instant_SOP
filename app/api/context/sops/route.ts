import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import {
  contextSopsParseErrorMessage,
  parseContextSopsQueryStrings,
} from '@/lib/context-sops-query'
import { loadContextSopsForSession } from '@/lib/server/context-sops'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const machineId = sp.get('machineId')
    if (!machineId) {
      return apiErrorResponse('Missing machineId', 400, { retryable: false })
    }

    const parsedMachineId = z.string().uuid().safeParse(machineId)
    if (!parsedMachineId.success) {
      return apiErrorResponse('Invalid machineId', 400, { retryable: false })
    }

    const parsed = parseContextSopsQueryStrings({
      stationCode: sp.get('stationCode'),
      stationId: sp.get('stationId'),
      trainingModuleId: sp.get('trainingModuleId'),
    })

    if (!parsed.ok) {
      return apiErrorResponse(contextSopsParseErrorMessage(parsed.error), 400, {
        retryable: false,
      })
    }

    const result = await loadContextSopsForSession(parsedMachineId.data, parsed)
    if (!result.ok) {
      if (result.error === 'unauthorized') {
        return apiErrorResponse('Unauthorized', 401, { retryable: false })
      }
      return apiErrorResponse('Machine not found', 404, { retryable: false })
    }

    return NextResponse.json(result.data)
  } catch (err) {
    console.error('GET /api/context/sops error:', err)
    return apiErrorResponse('Internal server error', 500)
  }
}
