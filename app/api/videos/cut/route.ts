import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { getObjectBytes, putObjectBytes } from '@/lib/r2'
import { ffmpegCutSegment } from '@/lib/ffmpeg-cut'
import { runVideoProcessingJob } from '@/lib/video-job-runner'
import { resolveStepVideoForProcessing } from '@/lib/resolve-step-video-edit'
import { waitUntil } from '@vercel/functions'
import { videoCutBodySchema } from '@/lib/validation/video-edit'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ENABLE_VIDEO_CUT !== 'true') {
    return apiErrorResponse(
      'Video cut is disabled. Set NEXT_PUBLIC_ENABLE_VIDEO_CUT=true when your host supports it.',
      503
    )
  }

  try {
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiErrorResponse('Unauthorized', 401, { retryable: false })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiErrorResponse('Invalid JSON', 400, { retryable: false })
    }

    const parsed = videoCutBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request body'
      return apiErrorResponse(msg, 400, { retryable: false })
    }

    const { sopId, stepId, startMs, endMs, videoPath: videoPathFromRequest, async: useAsyncRequested } =
      parsed.data

    const resolved = await resolveStepVideoForProcessing(supabase, {
      userId: user.id,
      sopId,
      stepId,
      videoPathFromBody: videoPathFromRequest,
    })
    if (!resolved.ok) {
      return apiErrorResponse(resolved.error, resolved.status, {
        retryable: resolved.status >= 500,
      })
    }

    const { videoPath: resolvedVideoPath, canEnqueueAsyncJob } = resolved
    const useAsync = useAsyncRequested === true && canEnqueueAsyncJob

    if (useAsync) {
      const service = createServiceRoleClient()
      const { data: job, error: jobErr } = await service
        .from('video_processing_jobs')
        .insert({
          user_id: user.id,
          sop_id: sopId,
          step_id: stepId,
          kind: 'cut',
          status: 'pending',
          payload: { startMs, endMs },
        })
        .select('id')
        .single()

      if (jobErr || !job) {
        console.error('Failed to create video job:', jobErr)
        return apiErrorResponse(jobErr?.message ?? 'Failed to create job', 500)
      }

      const jobId = job.id as string
      const work = runVideoProcessingJob(jobId)

      // On Vercel, extend the function lifetime so large ffmpeg runs can finish after the response.
      if (process.env.VERCEL) {
        waitUntil(work)
        return NextResponse.json({ jobId, status: 'pending' }, { status: 202 })
      }

      const ok = await work
      if (!ok) {
        const { data: row } = await service
          .from('video_processing_jobs')
          .select('error')
          .eq('id', jobId)
          .maybeSingle()
        return apiErrorResponse(row?.error ?? 'Cut failed', 500)
      }
      return NextResponse.json({ ok: true, jobId, status: 'completed' })
    }

    // Synchronous path (same process, no job row)
    let inputBuffer: Buffer
    try {
      inputBuffer = await getObjectBytes(resolvedVideoPath)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return apiErrorResponse(msg || 'Failed to read video from storage', 500)
    }

    try {
      const outBuffer = await ffmpegCutSegment(inputBuffer, startMs, endMs)
      await putObjectBytes(resolvedVideoPath, outBuffer, 'video/mp4')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return apiErrorResponse(msg, 500)
    }

    return NextResponse.json({ ok: true, videoPath: resolvedVideoPath })
  } catch (error) {
    const err = error as { message?: unknown; stack?: unknown; name?: unknown }
    const details =
      process.env.NODE_ENV === 'development'
        ? {
            name: typeof err?.name === 'string' ? err.name : undefined,
            message: typeof err?.message === 'string' ? err.message : String(error),
            stack: typeof err?.stack === 'string' ? err.stack : undefined,
          }
        : undefined
    console.error('Error in /api/videos/cut:', details ?? error)
    return apiErrorResponse(details?.message ?? 'Internal server error', 500, {
      details,
    })
  }
}
