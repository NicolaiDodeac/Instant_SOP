/**
 * Client-side video cut: remove a segment [startMs, endMs] and output a single blob.
 * Uses @ffmpeg/ffmpeg in the browser. Run only in client components.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'

const INPUT_NAME = 'input_cut.mp4'
const OUTPUT_NAME = 'output_cut.mp4'

let ffmpegInstance: FFmpeg | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) {
    if (ffmpegInstance.loaded) return ffmpegInstance
    ffmpegInstance.terminate()
    ffmpegInstance = null
  }
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const ffmpeg = new FFmpeg()
  await ffmpeg.load()
  ffmpegInstance = ffmpeg
  return ffmpeg
}

export interface CutVideoOptions {
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

/**
 * Remove the segment [startMs, endMs] from the video. Returns a new blob
 * containing: [0, startMs) + [endMs, totalDurationMs].
 */
export async function cutVideoSegment(
  blob: Blob,
  startMs: number,
  endMs: number,
  totalDurationMs: number,
  options: CutVideoOptions = {}
): Promise<Blob> {
  const { onProgress, signal } = options
  const ffmpeg = await getFFmpeg()

  const startSec = Math.max(0, startMs / 1000)
  const endSec = Math.min(totalDurationMs / 1000, endMs / 1000)
  const durationSec = totalDurationMs / 1000

  if (startSec >= endSec || endSec >= durationSec) {
    throw new Error('Invalid cut range: start must be less than end, and end less than duration')
  }

  const buffer = await blob.arrayBuffer()
  const data = new Uint8Array(buffer)
  await ffmpeg.writeFile(INPUT_NAME, data, { signal })

  const logLines: string[] = []
  const logCallback = ({ message }: { message: string }) => {
    logLines.push(message)
    if (logLines.length > 50) logLines.shift()
  }
  ffmpeg.on('log', logCallback)

  const progressCallback = onProgress
    ? ({ progress }: { progress: number }) => {
        onProgress(Math.min(1, Math.max(0, progress)))
      }
    : undefined
  if (progressCallback) {
    ffmpeg.on('progress', progressCallback)
  }

  // Part 1: 0 to startSec. Part 2: endSec to durationSec. Concat.
  // Use explicit start/end syntax and fixed decimal precision to avoid FFmpeg parse issues.
  const toSec = (v: number) => (Math.round(v * 1000) / 1000).toString()
  const startS = toSec(0)
  const cutStartS = toSec(startSec)
  const cutEndS = toSec(endSec)
  const durS = toSec(durationSec)
  const filter =
    `[0:v]trim=start=${startS}:end=${cutStartS},setpts=PTS-STARTPTS[v1];` +
    `[0:v]trim=start=${cutEndS}:end=${durS},setpts=PTS-STARTPTS[v2];` +
    `[v1][v2]concat=n=2:v=1[outv]`
  const exitCode = await ffmpeg.exec(
    [
      '-i', INPUT_NAME,
      '-filter_complex', filter,
      '-map', '[outv]',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-an',
      '-y',
      OUTPUT_NAME,
    ],
    0,
    { signal }
  )

  ffmpeg.off('log', logCallback)
  if (progressCallback) {
    ffmpeg.off('progress', progressCallback)
  }

  await ffmpeg.deleteFile(INPUT_NAME).catch(() => {})

  if (exitCode !== 0) {
    await ffmpeg.deleteFile(OUTPUT_NAME).catch(() => {})
    const tail = logLines.slice(-8).join(' ')
    throw new Error(`Cut failed (exit ${exitCode})${tail ? `: ${tail}` : ''}`)
  }

  const outData = await ffmpeg.readFile(OUTPUT_NAME)
  await ffmpeg.deleteFile(OUTPUT_NAME).catch(() => {})

  const bytes =
    outData instanceof Uint8Array
      ? new Uint8Array(outData)
      : new TextEncoder().encode(String(outData))
  return new Blob([bytes], { type: 'video/mp4' })
}
