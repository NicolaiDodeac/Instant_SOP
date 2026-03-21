/**
 * Feature flags (build-time via env).
 *
 * Video cut runs ffmpeg on the server and loads whole files into memory — enable only when
 * your host can handle large uploads (e.g. dedicated storage + enough RAM/time).
 */
export const isVideoCutEnabled = process.env.NEXT_PUBLIC_ENABLE_VIDEO_CUT === 'true'

/**
 * When true, cut uses a DB job + background processing on Vercel (`waitUntil`) and the
 * client polls `/api/videos/jobs/[id]`. On local dev, the job still runs in the same request.
 */
export const isVideoCutAsync = process.env.NEXT_PUBLIC_VIDEO_CUT_ASYNC === 'true'
