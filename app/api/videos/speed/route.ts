import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { getObjectBytes, putObjectBytes } from '@/lib/r2'
import { ffmpegSpeedSegment } from '@/lib/ffmpeg-cut'
import { runVideoProcessingJob } from '@/lib/video-job-runner'
import { resolveStepVideoForProcessing } from '@/lib/resolve-step-video-edit'
import { waitUntil } from '@vercel/functions'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ENABLE_VIDEO_CUT !== 'true') {
    return NextResponse.json(
      {
        error:
          'Video processing is disabled. Set NEXT_PUBLIC_ENABLE_VIDEO_CUT=true when your host supports ffmpeg.',
      },
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
      speedFactor?: number
      videoPath?: string | null
      async?: boolean
    }

    const sopId = body.sopId
    const stepId = body.stepId
    const startMs = body.startMs
    const endMs = body.endMs
    const speedFactor = body.speedFactor
    const useAsyncRequested = body.async === true

    if (!sopId || !stepId || typeof startMs !== 'number' || typeof endMs !== 'number') {
      return NextResponse.json({ error: 'Missing sopId, stepId, startMs, or endMs' }, { status: 400 })
    }
    if (!(startMs >= 0) || !(endMs > startMs)) {
      return NextResponse.json({ error: 'Invalid range' }, { status: 400 })
    }
    if (typeof speedFactor !== 'number' || !(speedFactor > 1) || speedFactor > 16) {
      return NextResponse.json({ error: 'speedFactor must be 1–16 (exclusive of 1)' }, { status: 400 })
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
          kind: 'speed',
          status: 'pending',
          payload: { startMs, endMs, speedFactor },
        })
        .select('id')
        .single()

      if (jobErr || !job) {
        console.error('Failed to create speed job:', jobErr)
        return NextResponse.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500 })
      }

      const jobId = job.id as string
      const work = runVideoProcessingJob(jobId)

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
        return NextResponse.json({ error: row?.error ?? 'Speed failed' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, jobId, status: 'completed' })
    }

    let inputBuffer: Buffer
    try {
      inputBuffer = await getObjectBytes(videoPath)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: msg || 'Failed to read video from storage' }, { status: 500 })
    }

    try {
      const outBuffer = await ffmpegSpeedSegment(inputBuffer, startMs, endMs, speedFactor)
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
    console.error('Error in /api/videos/speed:', details ?? error)
    return NextResponse.json(
      { error: details?.message ?? 'Internal server error', details },
      { status: 500 }
    )
  }
}
