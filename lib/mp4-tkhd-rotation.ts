/**
 * Read the first video-like track's display rotation from an MP4/MOV (ISO BMFF).
 * Returns clockwise degrees in {0, 90, 180, 270}, or null if not found / not MP4.
 *
 * Used when some Android/WebView decoders paint the coded frame but ignore tkhd rotation.
 */

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

function matrixToRotationDeg(a: number, b: number): number {
  const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI)
  const n = ((deg % 360) + 360) % 360
  return (Math.round(n / 90) * 90) % 360
}

function readTkhd(view: DataView, bodyStart: number, bodyEnd: number): number | null {
  if (bodyEnd - bodyStart < 84) return null
  const version = view.getUint8(bodyStart)
  const matrixOffset = version === 0 ? bodyStart + 40 : version === 1 ? bodyStart + 52 : 0
  if (!matrixOffset || matrixOffset + 44 > bodyEnd) return null

  const a = view.getInt32(matrixOffset)
  const b = view.getInt32(matrixOffset + 4)
  const trackWidthU32 = view.getUint32(matrixOffset + 36)
  const trackHeightU32 = view.getUint32(matrixOffset + 40)
  const tw = trackWidthU32 >>> 16
  const th = trackHeightU32 >>> 16
  if (tw === 0 && th === 0) return null

  return matrixToRotationDeg(a, b)
}

const DESCEND_TYPES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'dinf',
  'stbl',
  'edts',
  'uuid',
])

export function parseMp4TkhdRotation(buffer: ArrayBuffer): number | null {
  if (buffer.byteLength < 32) return null
  const view = new DataView(buffer)
  return parseTkhdRotationInBox(view, 0, buffer.byteLength)
}

function parseTkhdRotationInBox(view: DataView, start: number, end: number): number | null {
  let pos = start
  while (pos + 8 <= end) {
    let size = view.getUint32(pos)
    const type = readFourCC(view, pos + 4)
    let header = 8
    if (size === 1) {
      if (pos + 16 > end) break
      size = Number(view.getBigUint64(pos + 8))
      header = 16
    } else if (size === 0) {
      size = end - pos
    }
    if (size < header || pos + size > end) break

    const bodyStart = pos + header
    const next = pos + size

    if (type === 'tkhd') {
      const rot = readTkhd(view, bodyStart, next)
      if (rot != null) return rot
    } else if (DESCEND_TYPES.has(type)) {
      const r = parseTkhdRotationInBox(view, bodyStart, next)
      if (r != null) return r
    }

    pos = next
  }
  return null
}

const HEAD_BYTES = 262_144
const BLOB_MAX_SCAN = 12 * 1024 * 1024

/** Copy Uint8Array into its own ArrayBuffer for DataView. */
function copyBuf(u8: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u8.byteLength)
  new Uint8Array(out).set(u8)
  return out
}

/** Stream blob/file URLs: first 256 KiB plus last 256 KiB of up to ~12 MiB (typical moov placement). */
async function parseRotationStreamingNonHttp(url: string): Promise<number | null> {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok || !res.body) return null
  const reader = res.body.getReader()
  const head = new Uint8Array(HEAD_BYTES)
  let headLen = 0
  const tail = new Uint8Array(HEAD_BYTES)
  let tailFilled = 0
  let scanned = 0
  try {
    while (scanned < BLOB_MAX_SCAN) {
      const { done, value } = await reader.read()
      if (done) break
      for (let i = 0; i < value.length && scanned < BLOB_MAX_SCAN; i++) {
        const b = value[i]!
        if (headLen < HEAD_BYTES) {
          head[headLen++] = b
        } else {
          if (tailFilled < HEAD_BYTES) {
            tail[tailFilled++] = b
          } else {
            tail.copyWithin(0, 1)
            tail[HEAD_BYTES - 1] = b
          }
        }
        scanned++
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (headLen >= 32) {
    const r = parseMp4TkhdRotation(copyBuf(head.subarray(0, headLen)))
    if (r != null) return r
  }
  if (headLen >= HEAD_BYTES && tailFilled >= 32) {
    const tailSlice = tailFilled < HEAD_BYTES ? tail.subarray(0, tailFilled) : tail
    return parseMp4TkhdRotation(copyBuf(tailSlice))
  }
  return null
}

async function fetchByteRange(url: string, start: number, endInclusive: number): Promise<ArrayBuffer | null> {
  const res = await fetch(url, {
    headers: { Range: `bytes=${start}-${endInclusive}` },
    mode: 'cors',
  })
  if (res.status === 416) return null
  if (!res.ok) return null
  return res.arrayBuffer()
}

function parseTotalFromContentRange(res: Response): number | null {
  const cr = res.headers.get('Content-Range')
  if (!cr) return null
  const m = cr.match(/\/(\d+)\s*$/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * Fetches header and, for HTTP(S), tail when moov is at end of file (non-faststart uploads).
 * For blob: URLs, streams at most ~12MB to locate moov without loading huge files whole.
 */
export async function getMp4VideoRotationFromUrl(url: string): Promise<number | null> {
  const isHttp = url.startsWith('http://') || url.startsWith('https://')

  try {
    if (isHttp) {
      const headRes = await fetch(url, {
        headers: { Range: 'bytes=0-262143' },
        mode: 'cors',
      })
      if (!headRes.ok) return null
      const headBuf = await headRes.arrayBuffer()
      let r = parseMp4TkhdRotation(headBuf)
      if (r != null) return r

      const total =
        parseTotalFromContentRange(headRes) ??
        (() => {
          const cl = headRes.headers.get('Content-Length')
          const n = cl ? Number(cl) : NaN
          return Number.isFinite(n) ? n : null
        })()
      if (total && total > headBuf.byteLength) {
        const tailStart = Math.max(0, total - HEAD_BYTES)
        const tailBuf = await fetchByteRange(url, tailStart, total - 1)
        if (tailBuf) {
          r = parseMp4TkhdRotation(tailBuf)
          if (r != null) return r
        }
      }
      return null
    }

    return parseRotationStreamingNonHttp(url)
  } catch {
    return null
  }
}
