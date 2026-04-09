/**
 * Browser video compression using Mediabunny (WebCodecs-based).
 * Handles large files via streaming I/O; no WASM heap like FFmpeg.
 *
 * Output: MP4, 720px width, ~1.5 Mbps, no audio.
 */

import type { InputVideoTrack } from 'mediabunny'

function evenDimension(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

export interface MediabunnyCompressOptions {
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

/**
 * Compress a video blob with Mediabunny: resize to 720px, 1.5 Mbps, drop audio.
 * Uses WebCodecs (hardware-accelerated when available); works for large files.
 */
export async function compressVideoWithMediabunny(
  blob: Blob,
  options: MediabunnyCompressOptions = {}
): Promise<Blob> {
  const { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS } =
    await import('mediabunny')

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
    video: async (track: InputVideoTrack) => {
      const dw = Math.max(1, track.displayWidth)
      const dh = Math.max(1, track.displayHeight)
      const outW = evenDimension(720)
      const outH = evenDimension((720 * dh) / dw)
      return {
        width: outW,
        height: outH,
        fit: 'contain',
        bitrate: 1_500_000,
        frameRate: 30,
        /** Bake orientation into pixels; do not rely on MP4 rotation metadata after re-encode. */
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
