/**
 * Browser video compression using Mediabunny (WebCodecs-based).
 * Handles large files via streaming I/O; no WASM heap like FFmpeg.
 *
 * Output: MP4, H.264 via WebCodecs, quality-tier bitrate, no audio.
 *
 * FHD/UHD sources were twisting after upload while HD did not — same encode settings but different resize paths.
 * When the longest display side exceeds 720p-class (1280px), we cap the output display width at **720** so
 * compression matches native HD phone video (downscale + transcode). Sharper 1080 cap applies only to
 * already-HD-class sources.
 */

import type { InputVideoTrack } from 'mediabunny'

/** Max display width for sources that are already “HD-class” (longest side ≤ {@link HD_CLASS_LONG_SIDE_MAX}). */
const MAX_OUTPUT_DISPLAY_WIDTH_HD_TIER = 1080

/**
 * Longest side (px) for typical 720p phone video (e.g. 720×1280). Above this we treat as FHD/UHD and downscale
 * like HD recordings to avoid the bad orientation path.
 */
const HD_CLASS_LONG_SIDE_MAX = 1280

/** Display width cap for FHD/UHD — same narrow-side ballpark as 720p phone capture so behavior matches HD. */
const MAX_OUTPUT_DISPLAY_WIDTH_FHD_TIER = 720

export interface MediabunnyCompressOptions {
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

function displayWidthSquarePixels(track: InputVideoTrack): number {
  const r = track.rotation
  return r % 180 === 0 ? track.squarePixelWidth : track.squarePixelHeight
}

function maxOutputDisplayWidthForTrack(track: InputVideoTrack): number {
  const longSide = Math.max(track.displayWidth, track.displayHeight)
  if (longSide > HD_CLASS_LONG_SIDE_MAX) {
    return MAX_OUTPUT_DISPLAY_WIDTH_FHD_TIER
  }
  return MAX_OUTPUT_DISPLAY_WIDTH_HD_TIER
}

/**
 * Compress a video blob: downscale only, high quality tier, drop audio.
 * Uses WebCodecs (hardware-accelerated when available); works for large files.
 */
export async function compressVideoWithMediabunny(
  blob: Blob,
  options: MediabunnyCompressOptions = {}
): Promise<Blob> {
  const {
    Input,
    Output,
    Conversion,
    BlobSource,
    BufferTarget,
    Mp4OutputFormat,
    ALL_FORMATS,
    QUALITY_HIGH,
  } = await import('mediabunny')

  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  })

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  })

  const conversion = await Conversion.init({
    input,
    output,
    video: (track: InputVideoTrack) => ({
      width: Math.min(maxOutputDisplayWidthForTrack(track), displayWidthSquarePixels(track)),
      bitrate: QUALITY_HIGH,
      frameRate: 30,
    }),
    audio: { discard: true },
    showWarnings: false,
  })

  if (!conversion.isValid) {
    throw new Error('Conversion invalid: ' + conversion.discardedTracks.map((t) => t.reason).join(', '))
  }

  if (options.onProgress) {
    conversion.onProgress = (p: number) => options.onProgress!(Math.min(1, Math.max(0, p)))
  }

  if (options.signal) {
    options.signal.addEventListener('abort', () => {
      void conversion.cancel()
    })
  }

  await conversion.execute()

  const buffer = output.target.buffer
  if (!buffer) {
    throw new Error('Mediabunny conversion produced no output')
  }
  return new Blob([buffer], { type: 'video/mp4' })
}
