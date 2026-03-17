/**
 * Client-side video compression for SOP step videos.
 * Uses @ffmpeg/ffmpeg in the browser. Run only in client components.
 *
 * Target: MP4, H264, 720x1280 (portrait), ~2 Mbps, 30 fps.
 * Settings: scale=720:-2, -b:v 2M, -preset veryfast, -crf 28
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'

const INPUT_NAME = 'input.mp4'
const OUTPUT_NAME = 'output.mp4'

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

export interface CompressOptions {
  /** Called with 0–1 progress during compression */
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

/**
 * Compress a video blob to MP4 H264 720px width, ~2 Mbps.
 * Does not block the main thread (FFmpeg runs in a worker).
 */
export async function compressVideo(
  blob: Blob,
  options: CompressOptions = {}
): Promise<Blob> {
  const { onProgress, signal } = options
  const ffmpeg = await getFFmpeg()

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

  // Lighter pipeline to avoid WASM "Aborted()" (OOM): 480 width, no audio
  const exitCode = await ffmpeg.exec(
    [
      '-i', INPUT_NAME,
      '-vf', 'scale=480:-2',
      '-c:v', 'libx264',
      '-b:v', '1M',
      '-crf', '30',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
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

  if (exitCode !== 0) {
    await ffmpeg.deleteFile(INPUT_NAME).catch(() => {})
    const tail = logLines.slice(-8).join(' ')
    throw new Error(
      `Compression failed (exit ${exitCode})${tail ? `: ${tail}` : ''}`
    )
  }

  const outData = await ffmpeg.readFile(OUTPUT_NAME)
  await ffmpeg.deleteFile(INPUT_NAME).catch(() => {})
  await ffmpeg.deleteFile(OUTPUT_NAME).catch(() => {})

  const bytes =
    outData instanceof Uint8Array
      ? new Uint8Array(outData)
      : new TextEncoder().encode(String(outData))
  return new Blob([bytes], { type: 'video/mp4' })
}

const OUTPUT_WEBM = 'output.webm'

/**
 * Light compression: copy video stream, drop audio (-an).
 * Avoids video decode/encode so it does not trigger WASM OOM/Aborted().
 * For WebM input we output WebM (VP9 can't be copied into MP4); for MP4 we output MP4.
 */
export async function compressVideoLight(
  blob: Blob,
  options: CompressOptions = {}
): Promise<Blob> {
  const { signal } = options
  const ffmpeg = await getFFmpeg()

  const isWebm = typeof blob.type === 'string' && blob.type.includes('webm')
  const inputName = 'input.' + (isWebm ? 'webm' : 'mp4')
  const outputName = isWebm ? OUTPUT_WEBM : OUTPUT_NAME

  const buffer = await blob.arrayBuffer()
  const data = new Uint8Array(buffer)
  await ffmpeg.writeFile(inputName, data, { signal })

  const logLines: string[] = []
  const logCallback = ({ message }: { message: string }) => {
    logLines.push(message)
    if (logLines.length > 50) logLines.shift()
  }
  ffmpeg.on('log', logCallback)

  const exitCode = await ffmpeg.exec(
    [
      '-i', inputName,
      '-c:v', 'copy',
      '-an',
      '-y',
      outputName,
    ],
    0,
    { signal }
  )

  ffmpeg.off('log', logCallback)

  await ffmpeg.deleteFile(inputName).catch(() => {})

  if (exitCode !== 0) {
    await ffmpeg.deleteFile(outputName).catch(() => {})
    const tail = logLines.slice(-8).join(' ')
    throw new Error(
      `Light compression failed (exit ${exitCode})${tail ? `: ${tail}` : ''}`
    )
  }

  const outData = await ffmpeg.readFile(outputName)
  await ffmpeg.deleteFile(outputName).catch(() => {})

  const bytes =
    outData instanceof Uint8Array
      ? new Uint8Array(outData)
      : new TextEncoder().encode(String(outData))
  return new Blob([bytes], { type: isWebm ? 'video/webm' : 'video/mp4' })
}

/**
 * Call when done with compression for the session to free the worker.
 */
export function releaseFFmpeg(): void {
  if (ffmpegInstance) {
    ffmpegInstance.terminate()
    ffmpegInstance = null
  }
}
