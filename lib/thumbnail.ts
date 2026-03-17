/**
 * Generate a JPEG thumbnail from a video blob.
 * Seeks to ~1.5s and captures a frame at ~400px height.
 * Run only in browser (uses <video> and <canvas>).
 */

const SEEK_TIME_S = 1.5
const THUMB_HEIGHT = 400

/**
 * Generate a thumbnail image from a video blob.
 * @param videoBlob - Source video (e.g. compressed MP4)
 * @returns JPEG Blob
 */
export function generateThumbnail(videoBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('generateThumbnail must run in the browser'))
      return
    }

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    const url = URL.createObjectURL(videoBlob)
    video.src = url

    const cleanup = () => {
      video.removeEventListener('error', onError)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('seeked', onSeeked)
      URL.revokeObjectURL(url)
    }

    const onError = () => {
      cleanup()
      reject(new Error('Failed to load video for thumbnail'))
    }

    const onLoadedMetadata = () => {
      const seekTo = Math.min(SEEK_TIME_S, video.duration * 0.1)
      video.currentTime = seekTo
    }

    const onSeeked = () => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) {
          cleanup()
          reject(new Error('Video has no dimensions'))
          return
        }
        const scale = THUMB_HEIGHT / h
        const width = Math.round(w * scale)
        const height = Math.round(h * scale)

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          cleanup()
          reject(new Error('Could not get canvas context'))
          return
        }
        ctx.drawImage(video, 0, 0, width, height)

        canvas.toBlob(
          (jpegBlob) => {
            cleanup()
            if (jpegBlob) {
              resolve(jpegBlob)
            } else {
              reject(new Error('Failed to export thumbnail as JPEG'))
            }
          },
          'image/jpeg',
          0.85
        )
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error('Thumbnail generation failed'))
      }
    }

    video.addEventListener('error', onError)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('seeked', onSeeked)
    video.load()
  })
}
