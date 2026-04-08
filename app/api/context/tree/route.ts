import { NextResponse } from 'next/server'
import { getContextTreeForSession } from '@/lib/server/context-tree'

export async function GET() {
  try {
    const result = await getContextTreeForSession()
    if (!result.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(result.data)
  } catch (err) {
    console.error('GET /api/context/tree error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
