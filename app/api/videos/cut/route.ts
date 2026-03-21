import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { getObjectBytes, putObjectBytes } from '@/lib/r2'
import { ffmpegCutSegment } from '@/lib/ffmpeg-cut'
import { runVideoProcessingJob } from '@/lib/video-job-runner'
import { resolveStepVideoForProcessing } from '@/lib/resolve-step-video-edit'
import { waitUntil } from '@vercel/functions'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ENABLE_VIDEO_CUT !== 'true') {
    return NextResponse.json(
      { error: 'Video cut is disabled. Set NEXT_PUBLIC_ENABLE_VIDEO_CUT=true when your host supports it.' },
      { status: 503 }
    )
  }

  try {
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      sopId?: string
      stepId?: string
      startMs?: number
      endMs?: number
      /** R2 key for draft steps (nanoid) not yet in sop_steps — required when step id is not a UUID. */
      videoPath?: string | null
      /** When true, enqueue job and return 202; processing runs in background on Vercel (waitUntil). */
      async?: boolean
    }

    const sopId = body.sopId
    const stepId = body.stepId
    const startMs = body.startMs
    const endMs = body.endMs
    const useAsyncRequested = body.async === true

    if (!sopId || !stepId || typeof startMs !== 'number' || typeof endMs !== 'number') {
      return NextResponse.json({ error: 'Missing sopId, stepId, startMs, or endMs' }, { status: 400 })
    }
    if (!(startMs >= 0) || !(endMs > startMs)) {
      return NextResponse.json({ error: 'Invalid cut range' }, { status: 400 })
    }

    const resolved = await resolveStepVideoForProcessing(supabase, {
      userId: user.id,
      sopId,
      stepId,
      videoPathFromBody: body.videoPath,
    })
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const { videoPath, canEnqueueAsyncJob } = resolved
    const useAsync = useAsyncRequested && canEnqueueAsyncJob

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
        return NextResponse.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500 })
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
        return NextResponse.json(
          { error: row?.error ?? 'Cut failed' },
          { status: 500 }
        )
      }
      return NextResponse.json({ ok: true, jobId, status: 'completed' })
    }

    // Synchronous path (same process, no job row)
    let inputBuffer: Buffer
    try {
      inputBuffer = await getObjectBytes(videoPath)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: msg || 'Failed to read video from storage' }, { status: 500 })
    }

    try {
      const outBuffer = await ffmpegCutSegment(inputBuffer, startMs, endMs)
      await putObjectBytes(videoPath, outBuffer, 'video/mp4')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    return NextResponse.json({ ok: true, videoPath })
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
    return NextResponse.json(
      { error: details?.message ?? 'Internal server error', details },
      { status: 500 }
    )
  }
}
