const ASPECT_MIN = 0.2
const ASPECT_MAX = 5

function validDisplayAspect(r: number): boolean {
  return Number.isFinite(r) && r > ASPECT_MIN && r < ASPECT_MAX
}

/** Roughly landscape vs portrait vs ~square; used to reconcile VideoFrame vs videoWidth/height. */
function orientationBucket(r: number): 'landscape' | 'portrait' | 'square' {
  const tol = 0.02
  if (r > 1 + tol) return 'landscape'
  if (r < 1 - tol) return 'portrait'
  return 'square'
}

/**
 * Width/height ratio for the outer video box (`object-fit: contain` inside).
 *
 * Phone MP4s often store a landscape-coded frame plus rotation metadata. Some engines report that
 * coded size on `VideoFrame` while `videoWidth`/`videoHeight` (or the painted picture) match the
 * upright portrait clip — prioritizing VideoFrame alone then warps layout. We read both and, when
 * orientation buckets disagree, prefer the **portrait** ratio so default vertical recordings stay
 * upright in this app.
 */
export function getVideoDisplayAspectRatio(video: HTMLVideoElement): number | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  let intrinsic: number | null = null
  if (vw > 0 && vh > 0) {
    const r = vw / vh
    if (validDisplayAspect(r)) intrinsic = r
  }

  let fromFrame: number | null = null
  if (typeof VideoFrame !== 'undefined') {
    try {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const vf = new VideoFrame(video)
        try {
          const dw = vf.displayWidth
          const dh = vf.displayHeight
          if (dw > 0 && dh > 0) {
            const r = dw / dh
            if (validDisplayAspect(r)) fromFrame = r
          }
        } finally {
          vf.close()
        }
      }
    } catch {
      // No frame yet, tainted/cross-origin, or unsupported.
    }
  }

  if (intrinsic != null && fromFrame != null) {
    const bI = orientationBucket(intrinsic)
    const bF = orientationBucket(fromFrame)
    if (bI !== 'square' && bF !== 'square' && bI !== bF) {
      if (bI === 'portrait') return intrinsic
      if (bF === 'portrait') return fromFrame
      return intrinsic
    }
    return intrinsic
  }

  return intrinsic ?? fromFrame
}
