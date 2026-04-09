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
const DEBUG_LOGS = process.env.NODE_ENV === 'development'

export interface MediabunnyCompressOptions {
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

function displayWidthSquarePixels(track: InputVideoTrack): number {
  const r = track.rotation
  return r % 180 === 0 ? track.squarePixelWidth : track.squarePixelHeight
}

type Rotation = 0 | 90 | 180 | 270

function cancelRotation(r: Rotation): Rotation {
  return ((360 - r) % 360) as Rotation
}

/**
 * Compress a video blob: downscale only, high quality tier, drop audio.
 * Uses WebCodecs (hardware-accelerated when available); works for large files.
 */
export async function compressVideoWithMediabunny(
  blob: Blob,
  options: MediabunnyCompressOptions = {}
): Promise<Blob> {
  if (DEBUG_LOGS) {
    console.log(LOG_PREFIX, 'start', {
      nodeEnv: process.env.NODE_ENV,
      inputBytes: blob.size,
      inputType: blob.type,
    })
  }

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
      const naturalDisplayWidth = displayWidthSquarePixels(track)
      const targetWidth = Math.min(MAX_OUTPUT_DISPLAY_WIDTH, naturalDisplayWidth)

      if (DEBUG_LOGS) {
        console.log(LOG_PREFIX, 'input track', {
          rotation: track.rotation,
          displayWxH: [track.displayWidth, track.displayHeight],
          squareWxH: [track.squarePixelWidth, track.squarePixelHeight],
          codedWxH: [track.codedWidth, track.codedHeight],
          targetWidth,
        })
      }
      return {
        width: targetWidth,
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
  const out = new Blob([buffer], { type: 'video/mp4' })
  if (DEBUG_LOGS) {
    console.log(LOG_PREFIX, 'done', { outputBytes: out.size, outputType: out.type })
  }

  // Verify output rotation/geometry by re-opening the produced MP4.
  // If we detect "portrait pixels + still-rotated metadata", run a second fast pass to cancel metadata.
  try {
    const outInput = new Input({
      source: new BlobSource(out),
      formats: ALL_FORMATS,
    })
    const tracks = await outInput.getTracks()
    const v = tracks.find((t: unknown): t is InputVideoTrack => (t as InputVideoTrack).type === 'video')
    if (v) {
      if (DEBUG_LOGS) {
        console.log(LOG_PREFIX, 'output track', {
          rotation: v.rotation,
          displayWxH: [v.displayWidth, v.displayHeight],
          squareWxH: [v.squarePixelWidth, v.squarePixelHeight],
          codedWxH: [v.codedWidth, v.codedHeight],
        })
      }

      const rotation = v.rotation as Rotation
      const portraitPixels = v.codedHeight > v.codedWidth
      const landscapeDisplay = v.displayWidth > v.displayHeight
      const shouldCancelMetadataRotation =
        rotation !== 0 && portraitPixels && landscapeDisplay

      if (shouldCancelMetadataRotation) {
        // Keep this as a warning even outside dev; it's a self-healing media fix.
        console.warn(LOG_PREFIX, 'normalizing rotation metadata', {
          rotation,
          rotate: cancelRotation(rotation),
        })

        const normInput = new Input({
          source: new BlobSource(out),
          formats: ALL_FORMATS,
        })
        const normOutput = new Output({
          format: new Mp4OutputFormat(),
          target: new BufferTarget(),
        })
        const normConv = await Conversion.init({
          input: normInput,
          output: normOutput,
          video: (t: InputVideoTrack) => ({
            // Cancel existing rotation metadata without rotating pixels again.
            rotate: cancelRotation(t.rotation as Rotation),
            allowRotationMetadata: false,
            forceTranscode: true,
            width: Math.min(MAX_OUTPUT_DISPLAY_WIDTH, t.squarePixelWidth),
            bitrate: QUALITY_HIGH,
            frameRate: 30,
          }),
          audio: { discard: true },
          showWarnings: false,
        })
        if (!normConv.isValid) {
          throw new Error(
            'Normalization conversion invalid: ' +
              normConv.discardedTracks.map((t) => t.reason).join(', ')
          )
        }
        await normConv.execute()
        const normBuffer = normOutput.target.buffer
        if (!normBuffer) throw new Error('Normalization conversion produced no output')
        const normalized = new Blob([normBuffer], { type: 'video/mp4' })
        if (DEBUG_LOGS) {
          console.log(LOG_PREFIX, 'normalized done', {
            outputBytes: normalized.size,
            outputType: normalized.type,
          })
        }
        normInput.dispose()
        outInput.dispose()
        return normalized
      }
    } else {
      if (DEBUG_LOGS) {
        console.log(LOG_PREFIX, 'output track', { video: 'none' })
      }
    }
    outInput.dispose()
  } catch (e) {
    if (DEBUG_LOGS) {
      console.log(LOG_PREFIX, 'output probe failed', e)
    }
  }

  return out
}
