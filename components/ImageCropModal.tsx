'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Cropper, {
  getInitialCropFromCroppedAreaPixels,
  type Area,
  type MediaSize,
  type Size,
} from 'react-easy-crop'
import { getCroppedImageBlob } from '@/lib/crop-image'

/** Vertical full-phone frame (portrait). */
const PHONE_ASPECT = 9 / 16
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4

type Props = {
  imageSrc: string
  /** Hint from the picked file (e.g. image/png) — output may still be JPEG for non-PNG. */
  sourceMime?: string
  onCancel: () => void
  onComplete: (blob: Blob) => void
}

export default function ImageCropModal({
  imageSrc,
  sourceMime = 'image/jpeg',
  onCancel,
  onComplete,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const mediaSizeRef = useRef<MediaSize | null>(null)
  const cropSizeRef = useRef<Size | null>(null)
  const didInitPlacementRef = useRef(false)

  const tryInitPlacement = useCallback(() => {
    if (didInitPlacementRef.current) return
    const media = mediaSizeRef.current
    const cropSize = cropSizeRef.current
    if (!media?.naturalWidth || !cropSize?.width) return

    didInitPlacementRef.current = true
    const { crop, zoom: z } = getInitialCropFromCroppedAreaPixels(
      { x: 0, y: 0, width: media.naturalWidth, height: media.naturalHeight },
      media,
      0,
      cropSize,
      MIN_ZOOM,
      MAX_ZOOM
    )
    setCrop(crop)
    setZoom(z)
  }, [])

  /** Programmatic crop updates emit `onCropAreaChange`; drags emit both. */
  const onCropAreaUpdate = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const [busy, setBusy] = useState(false)

  useEffect(() => {
    didInitPlacementRef.current = false
    mediaSizeRef.current = null
    cropSizeRef.current = null
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
  }, [imageSrc])

  const onMediaLoaded = useCallback(
    (mediaSize: MediaSize) => {
      mediaSizeRef.current = mediaSize
      tryInitPlacement()
    },
    [tryInitPlacement]
  )

  const onCropSizeChange = useCallback(
    (size: Size) => {
      cropSizeRef.current = size
      tryInitPlacement()
    },
    [tryInitPlacement]
  )

  const handleDone = async () => {
    if (!croppedAreaPixels) return
    setBusy(true)
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, sourceMime)
      onComplete(blob)
    } catch (e) {
      console.error('Crop failed:', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/80 safe-top safe-bottom"
      role="dialog"
      aria-modal="true"
      aria-label="Crop image"
    >
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 text-white shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="touch-target px-3 py-2 text-sm font-medium rounded-lg bg-gray-700 hover:bg-gray-600"
        >
          Cancel
        </button>
        <span className="text-sm font-semibold">Crop &amp; use</span>
        <button
          type="button"
          onClick={() => void handleDone()}
          disabled={busy || !croppedAreaPixels}
          className="touch-target px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? '…' : 'Done'}
        </button>
      </div>

      <div className="relative flex-1 min-h-[200px] w-full">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={0}
          aspect={PHONE_ASPECT}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          restrictPosition={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropAreaUpdate}
          onCropAreaChange={onCropAreaUpdate}
          onMediaLoaded={onMediaLoaded}
          onCropSizeChange={onCropSizeChange}
          objectFit="contain"
        />
      </div>

      <div className="px-4 py-3 bg-gray-900 text-white space-y-2 shrink-0">
        <label className="flex items-center gap-3 text-sm">
          <span className="w-14 shrink-0">Zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 min-h-[44px]"
          />
        </label>
        <p className="text-xs text-gray-400">
          Frame is vertical (phone screen). Pinch or drag to choose what appears; zoom out leaves
          empty space where you place the photo. The saved image matches this frame.
        </p>
      </div>
    </div>
  )
}
