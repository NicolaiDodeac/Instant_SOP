/**
 * Browser video compression using Mediabunny (WebCodecs-based).
 * Handles large files via streaming I/O; no WASM heap like FFmpeg.
 *
 * Output: MP4, up to 1080px display width (never upscaled), H.264 via WebCodecs,
 * quality-tier bitrate from Mediabunny (scales with resolution; favors sharp detail on phones), no audio.
 */

import type { InputVideoTrack } from 'mediabunny'

/** Upper bound for the wider side after rotation metadata—matches common phone capture without huge files. */
const MAX_OUTPUT_DISPLAY_WIDTH = 1080

/**
 * Longest display side for typical 720p-class phone video. Above this (FHD/UHD portrait), some encodes arrive twisted
 * ~90° after upload; we bake with a fixed total rotation of 270° CW (one quarter-turn left vs upright coded frames),
 * then strip rotation metadata so storage always matches what you see in the editor.
 */
const HD_DISPLAY_LONG_SIDE_MAX = 1280

/** Total rotation (CW, Mediabunny) baked into pixels for the high-res portrait fix. 270° = “twist left” vs 0°. */
const HIGH_RES_PORTRAIT_BAKE_ROTATION = 270 as const

export interface MediabunnyCompressOptions {
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

type Rotation = 0 | 90 | 180 | 270

function displayWidthSquarePixels(track: InputVideoTrack): number {
  const r = track.rotation
  return r % 180 === 0 ? track.squarePixelWidth : track.squarePixelHeight
}

function needsHighResPortraitTwistFix(track: InputVideoTrack): boolean {
  const longSide = Math.max(track.displayWidth, track.displayHeight)
  if (longSide <= HD_DISPLAY_LONG_SIDE_MAX) return false
  // Portrait intent only — don’t rotate landscape FHD/UHD.
  return track.displayHeight > track.displayWidth
}

/** `track.rotation + returned value ≡ HIGH_RES_PORTRAIT_BAKE_ROTATION` (mod 360). */
function extraRotateForHighResPortrait(track: InputVideoTrack): Rotation {
  return ((HIGH_RES_PORTRAIT_BAKE_ROTATION - track.rotation + 360) % 360) as Rotation
}

/**
 * Compress a video blob with Mediabunny: cap resolution at 1080p (downscale only), high quality tier (~half the bitrate of VERY_HIGH at the same size), drop audio.
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
    video: (track: InputVideoTrack) => {
      const base = {
        width: Math.min(MAX_OUTPUT_DISPLAY_WIDTH, displayWidthSquarePixels(track)),
        bitrate: QUALITY_HIGH,
        frameRate: 30,
      }
      if (!needsHighResPortraitTwistFix(track)) return base
      return {
        ...base,
        rotate: extraRotateForHighResPortrait(track),
        allowRotationMetadata: false,
      }
    },
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
