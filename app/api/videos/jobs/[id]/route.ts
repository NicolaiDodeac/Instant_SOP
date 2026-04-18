import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
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
      return apiErrorResponse('Missing job id', 400, { retryable: false })
    }

    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiErrorResponse('Unauthorized', 401, { retryable: false })
    }

    const { data: job, error } = await supabase
      .from('video_processing_jobs')
      .select('id, status, kind, payload, error, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      return apiErrorResponse(error.message, 500)
    }
    if (!job) {
      return apiErrorResponse('Not found', 404, { retryable: false })
    }

    return NextResponse.json(job)
  } catch (e) {
    console.error('GET /api/videos/jobs/[id]:', e)
    return apiErrorResponse('Internal server error', 500)
  }
}
