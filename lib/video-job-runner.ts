import { createServiceRoleClient } from '@/lib/supabase/server'
import { getObjectBytes, putObjectBytes } from '@/lib/r2'
import { ffmpegCutSegment, ffmpegSpeedSegment } from '@/lib/ffmpeg-cut'

/** @returns true if processing completed and upload succeeded */
export async function runVideoProcessingJob(jobId: string): Promise<boolean> {
  const service = createServiceRoleClient()

  const { data: job, error: fetchErr } = await service
    .from('video_processing_jobs')
    .select('id, step_id, kind, payload')
    .eq('id', jobId)
    .maybeSingle()

  if (fetchErr || !job) {
    console.error('runVideoProcessingJob: job not found', jobId, fetchErr)
    return false
  }

  const kind = job.kind as string
  const payload = job.payload as Record<string, unknown>
  const startMs = payload.startMs
  const endMs = payload.endMs

  if (typeof startMs !== 'number' || typeof endMs !== 'number' || !(endMs > startMs)) {
    await service
      .from('video_processing_jobs')
      .update({
        status: 'failed',
        error: 'Invalid payload',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    return false
  }

  if (kind === 'speed') {
    const speedFactor = payload.speedFactor
    if (typeof speedFactor !== 'number' || !(speedFactor > 1) || speedFactor > 16) {
      await service
        .from('video_processing_jobs')
        .update({
          status: 'failed',
          error: 'Invalid speedFactor',
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
      return false
    }
  }

  const { data: stepRow } = await service
    .from('sop_steps')
    .select('video_path')
    .eq('id', job.step_id)
    .maybeSingle()

  const videoPath = stepRow?.video_path
  if (!videoPath) {
    await service
      .from('video_processing_jobs')
      .update({
        status: 'failed',
        error: 'Step has no video',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    return false
  }

  await service
    .from('video_processing_jobs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', jobId)

  try {
    const inputBuffer = await getObjectBytes(videoPath)
    let outBuffer: Buffer
    if (kind === 'cut') {
      outBuffer = await ffmpegCutSegment(inputBuffer, startMs, endMs)
    } else if (kind === 'speed') {
      outBuffer = await ffmpegSpeedSegment(inputBuffer, startMs, endMs, payload.speedFactor as number)
    } else {
      throw new Error(`Unknown job kind: ${kind}`)
    }
    await putObjectBytes(videoPath, outBuffer, 'video/mp4')

    await service
      .from('video_processing_jobs')
      .update({
        status: 'completed',
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('runVideoProcessingJob failed:', jobId, msg)
    await service
      .from('video_processing_jobs')
      .update({
        status: 'failed',
        error: msg.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    return false
  }
}

/** @deprecated use runVideoProcessingJob — kept for grep clarity */
export async function runCutJob(jobId: string): Promise<boolean> {
  return runVideoProcessingJob(jobId)
}
