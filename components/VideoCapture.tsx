'use client'

import { useState, useRef, useEffect } from 'react'
import { saveVideoBlob, saveImageBlob } from '@/lib/idb'
import ImageCropModal from '@/components/ImageCropModal'

interface VideoCaptureProps {
  stepId: string
  sopId: string
  onVideoCaptured: (blob: Blob, duration: number) => void
  onImageCaptured?: (blob: Blob) => void
  existingVideoPath?: string
  existingImagePath?: string
}

export default function VideoCapture({
  stepId,
  sopId,
  onVideoCaptured,
  onImageCaptured,
  existingVideoPath,
  existingImagePath,
}: VideoCaptureProps) {
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [imageCrop, setImageCrop] = useState<{ url: string; mime: string } | null>(null)
  /** Matches camera / preview frame so SD or landscape fallbacks are not forced into a 9:16 box. */
  const [previewAspect, setPreviewAspect] = useState<number | null>(null)

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const startRecording = async () => {
    setError(null)
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        const secure = typeof window !== 'undefined' && window.isSecureContext
        setError(
          secure
            ? 'Camera not available in this browser.'
            : 'Recording needs HTTPS. On your phone, open the app via an https:// link (e.g. use a tunnel like ngrok, or deploy the app) so the camera can be used.'
        )
        return
      }
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            aspectRatio: { ideal: 9 / 16 },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
          },
          audio: false,
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 720 },
            height: { ideal: 1280 },
          },
          audio: false,
        })
      }

      if (videoRef.current) {
        const el = videoRef.current
        const onMeta = () => {
          const w = el.videoWidth
          const h = el.videoHeight
          if (w > 0 && h > 0) {
            const r = w / h
            if (Number.isFinite(r) && r > 0.2 && r < 5) setPreviewAspect(r)
          }
        }
        el.addEventListener('loadedmetadata', onMeta, { once: true })
        el.srcObject = stream
        setPreviewAspect(null)
        void el.play()
      }

      const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm;codecs=vp9'
      const recorderOptions: MediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: 1_500_000,
      }
      const mediaRecorder = new MediaRecorder(stream, recorderOptions)

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType.split(';')[0] })
        const durationMs = Math.round(duration * 1000)

        // Save to IndexedDB
        await saveVideoBlob(stepId, sopId, blob)

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop())
        if (videoRef.current) {
          videoRef.current.srcObject = null
        }
        setPreviewAspect(null)

        onVideoCaptured(blob, durationMs)
        setDuration(0)
      }

      mediaRecorder.start()
      setRecording(true)
      setDuration(0)

      // Track duration
      durationIntervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 0.1)
      }, 100)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to access camera'
      )
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      setRecording(false)
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const isImage = file.type.startsWith('image/')
    if (isImage && onImageCaptured) {
      const url = URL.createObjectURL(file)
      setImageCrop({ url, mime: file.type || 'image/jpeg' })
      return
    }

    try {
      const blob = file
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.src = URL.createObjectURL(blob)

      video.onloadedmetadata = async () => {
        const durationMs = Math.round(video.duration * 1000)
        await saveVideoBlob(stepId, sopId, blob)
        onVideoCaptured(blob, durationMs)
        URL.revokeObjectURL(video.src)
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load video'
      )
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-4">
      {imageCrop && (
        <ImageCropModal
          imageSrc={imageCrop.url}
          sourceMime={imageCrop.mime}
          onCancel={() => {
            URL.revokeObjectURL(imageCrop.url)
            setImageCrop(null)
          }}
          onComplete={async (blob) => {
            URL.revokeObjectURL(imageCrop.url)
            setImageCrop(null)
            try {
              await saveImageBlob(stepId, sopId, blob)
              onImageCaptured?.(blob)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to save image')
            }
          }}
        />
      )}
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {existingVideoPath || existingImagePath ? (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p className="text-sm text-green-700 dark:text-green-300">
            Media uploaded
          </p>
        </div>
      ) : (
        <>
          <div
            className={`relative w-full mx-auto bg-black rounded-lg overflow-hidden max-h-[78dvh] min-h-[200px] md:max-h-[85vh] md:min-h-[200px] ${
              previewAspect != null && previewAspect > 1
                ? 'max-w-[min(100%,calc(100dvh*16/9))]'
                : 'max-w-[min(100%,calc(100dvh*9/16))]'
            }`}
            style={
              previewAspect != null ? { aspectRatio: previewAspect } : { aspectRatio: 9 / 16 }
            }
          >
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              playsInline
              muted
            />
            {recording && (
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
                <span className="text-white font-mono text-lg">
                  {formatDuration(duration)}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {!recording ? (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg touch-target"
                >
                  Record
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="video/*,image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg touch-target"
                >
                  Choose File
                </button>
              </>
            ) : (
              <button
                onClick={stopRecording}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg touch-target"
              >
                Stop Recording
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
