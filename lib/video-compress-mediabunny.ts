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

export interface MediabunnyCompressOptions {
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

function displayWidthSquarePixels(track: InputVideoTrack): number {
  const r = track.rotation
  return r % 180 === 0 ? track.squarePixelWidth : track.squarePixelHeight
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
    video: (track: InputVideoTrack) => ({
      width: Math.min(MAX_OUTPUT_DISPLAY_WIDTH, displayWidthSquarePixels(track)),
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
