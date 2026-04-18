import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { createClientServer } from '@/lib/supabase/server'
import type { MachineFamilyStation } from '@/lib/types'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiErrorResponse('Unauthorized', 401, { retryable: false })
    }

    const familyId = request.nextUrl.searchParams.get('machineFamilyId')
    if (!familyId) {
      return apiErrorResponse('Missing machineFamilyId', 400, { retryable: false })
    }

    const parsedFamilyId = z.string().uuid().safeParse(familyId)
    if (!parsedFamilyId.success) {
      return apiErrorResponse('Invalid machineFamilyId', 400, { retryable: false })
    }

    const { data: famRow } = await supabase
      .from('machine_families')
      .select('uses_hmi_station_codes')
      .eq('id', parsedFamilyId.data)
      .maybeSingle()

    const usesHmiStationCodes = Boolean(
      famRow && (famRow as { uses_hmi_station_codes?: boolean }).uses_hmi_station_codes
    )

    const { data } = await supabase
      .from('machine_family_stations')
      .select('*')
      .eq('machine_family_id', parsedFamilyId.data)
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

    return NextResponse.json({ usesHmiStationCodes, stationsBySection: bySection })
  } catch (err) {
    console.error('GET /api/context/family-stations error:', err)
    return apiErrorResponse('Internal server error', 500)
  }
}

