import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'
import type { MachineFamilyStation } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const familyId = request.nextUrl.searchParams.get('machineFamilyId')
    if (!familyId) {
      return NextResponse.json({ error: 'Missing machineFamilyId' }, { status: 400 })
    }

    const { data } = await supabase
      .from('machine_family_stations')
      .select('*')
      .eq('machine_family_id', familyId)
      .eq('active', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('station_code', { ascending: true })

    const rows = (data ?? []) as MachineFamilyStation[]
    const bySection: Record<string, MachineFamilyStation[]> = {}
    for (const s of rows) {
      const key = s.section || 'Other'
      bySection[key] = bySection[key] ?? []
      bySection[key].push(s)
    }

    return NextResponse.json({ stationsBySection: bySection })
  } catch (err) {
    console.error('GET /api/context/family-stations error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

