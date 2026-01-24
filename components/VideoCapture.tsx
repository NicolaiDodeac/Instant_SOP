'use client'

import { useState, useRef, useEffect } from 'react'
import { saveVideoBlob } from '@/lib/idb'

interface VideoCaptureProps {
  stepId: string
  sopId: string
  onVideoCaptured: (blob: Blob, duration: number) => void
  existingVideoPath?: string
}

export default function VideoCapture({
  stepId,
  sopId,
  onVideoCaptured,
  existingVideoPath,
}: VideoCaptureProps) {
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/mp4',
      })

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/mp4' })
        const durationMs = Math.round(duration * 1000)

        // Save to IndexedDB
        await saveVideoBlob(stepId, sopId, blob)

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop())

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
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {existingVideoPath ? (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p className="text-sm text-green-700 dark:text-green-300">
            Video uploaded
          </p>
        </div>
      ) : (
        <>
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
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
                  onClick={startRecording}
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
                <button
                  onClick={() => fileInputRef.current?.click()}
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
