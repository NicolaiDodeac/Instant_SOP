import { execFile } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

function resolveFfmpegBinary(): string {
  try {
    const p = require('ffmpeg-static') as string | undefined
    if (typeof p === 'string' && p.length > 0 && existsSync(p)) {
      try {
        chmodSync(p, 0o755)
      } catch {
        // ignore chmod errors (e.g. read-only fs)
      }
      return p
    }
  } catch {
    // not installed or externalized path missing
  }
  const cwdFallback = join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg')
  if (existsSync(cwdFallback)) {
    try {
      chmodSync(cwdFallback, 0o755)
    } catch {
      /* ignore */
    }
    return cwdFallback
  }
  return 'ffmpeg'
}

/**
 * Remove segment [startMs, endMs) and concatenate before + after. No audio.
 * Returns encoded MP4 buffer.
 */
export async function ffmpegCutSegment(inputBuffer: Buffer, startMs: number, endMs: number): Promise<Buffer> {
  if (!(startMs >= 0) || !(endMs > startMs)) {
    throw new Error('Invalid cut range')
  }

  const dir = await mkdtemp(join(tmpdir(), 'instant-sop-cut-'))
  const inPath = join(dir, 'in.mp4')
  const outPath = join(dir, 'out.mp4')
  await writeFile(inPath, inputBuffer)

  const startSec = startMs / 1000
  const endSec = endMs / 1000
  const filter =
    `[0:v]trim=start=0:end=${startSec},setpts=PTS-STARTPTS[v1];` +
    `[0:v]trim=start=${endSec},setpts=PTS-STARTPTS[v2];` +
    `[v1][v2]concat=n=2:v=1[outv]`

  const bin = resolveFfmpegBinary()

  try {
    await execFileAsync(bin, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inPath,
      '-filter_complex',
      filter,
      '-map',
      '[outv]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-an',
      '-y',
      outPath,
    ])
  } catch (err) {
    const anyErr = err as { message?: unknown; stderr?: unknown }
    const message = [
      typeof anyErr?.message === 'string' ? anyErr.message : null,
      anyErr?.stderr ? String(anyErr.stderr) : null,
    ]
      .filter(Boolean)
      .join('\n') || 'ffmpeg failed'
    await rm(dir, { recursive: true, force: true })
    if (message.includes('ENOENT') || message.toLowerCase().includes('not found')) {
      throw new Error(
        'ffmpeg binary not found on server. Deploy on a host with ffmpeg or use ffmpeg-static.'
      )
    }
    throw new Error(message)
  }

  const outBuffer = await readFile(outPath)
  await rm(dir, { recursive: true, force: true })
  return outBuffer
}

async function getVideoDurationSec(bin: string, inPath: string): Promise<number> {
  let stderr = ''
  try {
    await execFileAsync(bin, ['-hide_banner', '-i', inPath], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  } catch (e: unknown) {
    const err = e as { stderr?: string | Buffer }
    if (typeof err.stderr === 'string') stderr = err.stderr
    else if (Buffer.isBuffer(err.stderr)) stderr = err.stderr.toString('utf8')
  }
  const m = /Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d{2})/.exec(stderr)
  if (!m) throw new Error('Could not read video duration')
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const sec = parseFloat(m[3])
  return h * 3600 + min * 60 + sec
}

/**
 * Speed up only [startMs, endMs) by `speed` (>1), concat with head and tail unchanged. No audio.
 */
export async function ffmpegSpeedSegment(
  inputBuffer: Buffer,
  startMs: number,
  endMs: number,
  speed: number
): Promise<Buffer> {
  if (!(startMs >= 0) || !(endMs > startMs)) {
    throw new Error('Invalid speed range')
  }
  if (!(speed > 1) || speed > 16 || !Number.isFinite(speed)) {
    throw new Error('Speed factor must be between 1 and 16')
  }

  const dir = await mkdtemp(join(tmpdir(), 'instant-sop-speed-'))
  const inPath = join(dir, 'in.mp4')
  const outPath = join(dir, 'out.mp4')
  await writeFile(inPath, inputBuffer)

  const bin = resolveFfmpegBinary()
  const durationSec = await getVideoDurationSec(bin, inPath)
  const startSec = startMs / 1000
  const endSec = endMs / 1000
  if (startSec >= durationSec - 1e-3) {
    await rm(dir, { recursive: true, force: true })
    throw new Error('Range starts at or after end of video')
  }
  const endClamped = Math.min(endSec, durationSec)

  let filter: string
  const s = speed

  const hasHead = startSec > 1e-6
  const hasTail = endClamped < durationSec - 1e-3

  if (!hasHead && !hasTail) {
    filter = `[0:v]setpts=PTS/${s}[outv]`
  } else {
    const parts: string[] = []
    const labels: string[] = []
    let i = 0
    if (hasHead) {
      parts.push(`[0:v]trim=start=0:end=${startSec},setpts=PTS-STARTPTS[v${i}]`)
      labels.push(`[v${i}]`)
      i++
    }
    parts.push(
      `[0:v]trim=start=${startSec}:end=${endClamped},setpts=(PTS-STARTPTS)/${s}[v${i}]`
    )
    labels.push(`[v${i}]`)
    i++
    if (hasTail) {
      parts.push(`[0:v]trim=start=${endClamped},setpts=PTS-STARTPTS[v${i}]`)
      labels.push(`[v${i}]`)
      i++
    }
    parts.push(`${labels.join('')}concat=n=${labels.length}:v=1[outv]`)
    filter = parts.join(';')
  }

  try {
    await execFileAsync(bin, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inPath,
      '-filter_complex',
      filter,
      '-map',
      '[outv]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-an',
      '-y',
      outPath,
    ])
  } catch (err) {
    const anyErr = err as { message?: unknown; stderr?: unknown }
    const message =
      [typeof anyErr?.message === 'string' ? anyErr.message : null, anyErr?.stderr ? String(anyErr.stderr) : null]
        .filter(Boolean)
        .join('\n') || 'ffmpeg failed'
    await rm(dir, { recursive: true, force: true })
    if (message.includes('ENOENT') || message.toLowerCase().includes('not found')) {
      throw new Error(
        'ffmpeg binary not found on server. Deploy on a host with ffmpeg or use ffmpeg-static.'
      )
    }
    throw new Error(message)
  }

  const outBuffer = await readFile(outPath)
  await rm(dir, { recursive: true, force: true })
  return outBuffer
}
