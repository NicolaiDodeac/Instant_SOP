'use client'

import { useState, useCallback } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { getCroppedImageBlob } from '@/lib/crop-image'

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

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const [busy, setBusy] = useState(false)

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
          aspect={undefined}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          objectFit="contain"
        />
      </div>

      <div className="px-4 py-3 bg-gray-900 text-white space-y-2 shrink-0">
        <label className="flex items-center gap-3 text-sm">
          <span className="w-14 shrink-0">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 min-h-[44px]"
          />
        </label>
        <p className="text-xs text-gray-400">Drag to position, pinch or use zoom to frame the step photo.</p>
      </div>
    </div>
  )
}
