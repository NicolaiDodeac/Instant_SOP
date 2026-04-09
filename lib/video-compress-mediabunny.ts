/**
 * Browser video compression using Mediabunny (WebCodecs-based).
 * Handles large files via streaming I/O; no WASM heap like FFmpeg.
 *
 * Output: MP4, up to 1080px display width (never upscaled), H.264 via WebCodecs,
 * Mediabunny quality-tier bitrate (QUALITY_HIGH), no audio.
 *
 * Orientation: we always set `allowRotationMetadata: false` so Mediabunny bakes rotation into
 * pixels for any non-zero `track.rotation`. Otherwise transcoding can skip the canvas path when
 * dimensions match, and encoded MP4 rotation metadata / pixel layout can disagree after upload —
 * often visible on FHD while HD still looked fine.
 *
 * Debugging wrong twist:
 * 1. Set `NEXT_PUBLIC_DISABLE_VIDEO_COMPRESSION=1` and upload — if orientation is correct, the bug is in this module.
 * 2. In dev, watch `[video-compress]` logs (rotation + coded vs display size).
 * 3. After compress, `URL.createObjectURL(outBlob)` in DevTools and open in a new tab before upload.
 */

import type { InputVideoTrack } from 'mediabunny'

const MAX_OUTPUT_DISPLAY_WIDTH = 1080

const LOG_PREFIX = '[video-compress]'

export interface MediabunnyCompressOptions {
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

function displayWidthSquarePixels(track: InputVideoTrack): number {
  const r = track.rotation
  return r % 180 === 0 ? track.squarePixelWidth : track.squarePixelHeight
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
    video: (track: InputVideoTrack) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(LOG_PREFIX, 'input track', {
          rotation: track.rotation,
          displayWxH: [track.displayWidth, track.displayHeight],
          squareWxH: [track.squarePixelWidth, track.squarePixelHeight],
          codedWxH: [track.codedWidth, track.codedHeight],
          targetWidth: Math.min(MAX_OUTPUT_DISPLAY_WIDTH, displayWidthSquarePixels(track)),
        })
      }
      return {
        width: Math.min(MAX_OUTPUT_DISPLAY_WIDTH, displayWidthSquarePixels(track)),
        bitrate: QUALITY_HIGH,
        frameRate: 30,
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
