import { NextRequest, NextResponse } from 'next/server'
import {
  contextSopsParseErrorMessage,
  parseContextSopsQueryStrings,
} from '@/lib/context-sops-query'
import { loadContextSopsForSession } from '@/lib/server/context-sops'

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const machineId = sp.get('machineId')
    if (!machineId) {
      return NextResponse.json({ error: 'Missing machineId' }, { status: 400 })
    }

    const parsed = parseContextSopsQueryStrings({
      stationCode: sp.get('stationCode'),
      stationId: sp.get('stationId'),
      trainingModuleId: sp.get('trainingModuleId'),
    })

    if (!parsed.ok) {
      return NextResponse.json(
        { error: contextSopsParseErrorMessage(parsed.error) },
        { status: 400 }
      )
    }

    const result = await loadContextSopsForSession(machineId, parsed)
    if (!result.ok) {
      if (result.error === 'unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 })
    }

    return NextResponse.json(result.data)
  } catch (err) {
    console.error('GET /api/context/sops error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
