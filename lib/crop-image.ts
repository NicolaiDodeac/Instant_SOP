import type { Area } from 'react-easy-crop'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (e) => reject(e))
    image.src = url
  })
}

/**
 * Crop a region (natural image pixel coordinates) to a blob.
 * When the crop rect extends outside the source (letterboxing / free placement),
 * missing areas are filled with black (JPEG) or left transparent (PNG).
 */
export async function getCroppedImageBlob(
  imageSrc: string,
  pixelCrop: Area,
  mimeType: string = 'image/jpeg',
  quality = 0.92
): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const nw = image.naturalWidth
  const nh = image.naturalHeight

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')

  const outW = Math.max(1, Math.round(pixelCrop.width))
  const outH = Math.max(1, Math.round(pixelCrop.height))
  canvas.width = outW
  canvas.height = outH

  const outType = mimeType.startsWith('image/png') ? 'image/png' : 'image/jpeg'
  if (outType === 'image/png') {
    ctx.clearRect(0, 0, outW, outH)
  } else {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, outW, outH)
  }

  const cx = pixelCrop.x
  const cy = pixelCrop.y
  const ix1 = Math.max(0, cx)
  const iy1 = Math.max(0, cy)
  const ix2 = Math.min(nw, cx + pixelCrop.width)
  const iy2 = Math.min(nh, cy + pixelCrop.height)

  if (ix2 > ix1 && iy2 > iy1) {
    const sw = ix2 - ix1
    const sh = iy2 - iy1
    const dx = ix1 - cx
    const dy = iy1 - cy
    ctx.drawImage(image, ix1, iy1, sw, sh, dx, dy, sw, sh)
  }
  const q = outType === 'image/png' ? undefined : quality
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Crop produced empty image'))),
      outType,
      q
    )
  })
}
