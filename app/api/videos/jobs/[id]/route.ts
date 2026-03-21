import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/** Poll async video job status (cut, etc.). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Missing job id' }, { status: 400 })
    }

    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: job, error } = await supabase
      .from('video_processing_jobs')
      .select('id, status, kind, payload, error, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!job) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(job)
  } catch (e) {
    console.error('GET /api/videos/jobs/[id]:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
