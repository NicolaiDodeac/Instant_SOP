import { NextRequest, NextResponse } from 'next/server'
import { loadOpsMachineContextForSession } from '@/lib/server/context-machine'

export async function GET(request: NextRequest) {
  try {
    const machineId = request.nextUrl.searchParams.get('machineId')
    if (!machineId) {
      return NextResponse.json({ error: 'Missing machineId' }, { status: 400 })
    }

    const result = await loadOpsMachineContextForSession(machineId)
    if (!result.ok) {
      if (result.error === 'unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (result.error === 'bad_request') {
        return NextResponse.json({ error: 'Missing machineId' }, { status: 400 })
      }
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 })
    }

    return NextResponse.json(result.data)
  } catch (err) {
    console.error('GET /api/context/machine error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
