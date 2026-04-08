import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { isSuperUserIdFromEnv } from '@/lib/super-user-env'

/** POST: create a step_annotations row. Uses server auth + ownership/super-user check, then service-role insert so RLS is not blocking. */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClientServer()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      step_id,
      t_start_ms,
      t_end_ms,
      kind,
      x,
      y,
      angle,
      text,
      style,
    } = body

    if (
      typeof step_id !== 'string' ||
      typeof t_start_ms !== 'number' ||
      typeof t_end_ms !== 'number' ||
      kind !== 'arrow' && kind !== 'label' ||
      typeof x !== 'number' ||
      typeof y !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Invalid body: need step_id, t_start_ms, t_end_ms, kind, x, y' },
        { status: 400 }
      )
    }

    const service = createServiceRoleClient()

    // Resolve step -> sop and check owner or super user
    const { data: step, error: stepError } = await service
      .from('sop_steps')
      .select('id, sop_id')
      .eq('id', step_id)
      .single()

    if (stepError || !step) {
      return NextResponse.json({ error: 'Step not found' }, { status: 404 })
    }

    const { data: sop } = await service
      .from('sops')
      .select('owner')
      .eq('id', step.sop_id)
      .single()

    const isOwner = sop?.owner === user.id
    const { data: superRow } = await service
      .from('super_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const isSuperUser = !!superRow || isSuperUserIdFromEnv(user.id)

    if (!isOwner && !isSuperUser) {
      return NextResponse.json(
        { error: 'Forbidden: only the SOP owner or a super user can add annotations' },
        { status: 403 }
      )
    }

    const row: Record<string, unknown> = {
      step_id,
      t_start_ms,
      t_end_ms,
      kind,
      x,
      y,
    }
    if (angle !== undefined) row.angle = angle
    if (text !== undefined) row.text = text
    if (style != null) row.style = style

    const { data: inserted, error: insertError } = await service
      .from('step_annotations')
      .insert(row)
      .select()
      .single()

    if (insertError) {
      console.error('Annotation insert error:', insertError)
      return NextResponse.json(
        { error: insertError.message ?? 'Insert failed' },
        { status: 500 }
      )
    }

    return NextResponse.json(inserted)
  } catch (err) {
    console.error('POST /api/annotations error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    )
  }
}
