import { execFile } from 'node:child_process'
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
    if (typeof p === 'string' && p.length > 0) return p
  } catch {
    // not installed or externalized path missing
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
