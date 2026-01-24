'use client'

import { useState, useEffect, useRef } from 'react'

interface TimeBarProps {
  duration: number // in ms
  currentTime: number // in ms
  startTime: number // in ms
  endTime: number // in ms
  onStartTimeChange: (time: number) => void
  onEndTimeChange: (time: number) => void
  onSeek: (time: number) => void
}

export default function TimeBar({
  duration,
  currentTime,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  onSeek,
}: TimeBarProps) {
  const [dragging, setDragging] = useState<'start' | 'end' | 'playhead' | null>(
    null
  )
  const trackRef = useRef<HTMLDivElement>(null)

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getPositionFromEvent = (e: React.TouchEvent | React.MouseEvent) => {
    const track = trackRef.current
    if (!track) return 0

    const rect = track.getBoundingClientRect()
    const clientX =
      'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
    const x = clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    return Math.round(percentage * duration)
  }

  const handleStart = (
    type: 'start' | 'end' | 'playhead',
    e: React.TouchEvent | React.MouseEvent
  ) => {
    setDragging(type)
    e.preventDefault()
    if ('vibrate' in navigator) {
      navigator.vibrate(10)
    }
  }

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!dragging) return
    e.preventDefault()

    const time = getPositionFromEvent(e)
    const snapped = Math.round(time / 100) * 100 // Snap to 0.1s

    if (dragging === 'start') {
      onStartTimeChange(Math.min(snapped, endTime - 100))
    } else if (dragging === 'end') {
      onEndTimeChange(Math.max(snapped, startTime + 100))
    } else if (dragging === 'playhead') {
      onSeek(snapped)
    }
  }

  const handleEnd = () => {
    setDragging(null)
  }

  useEffect(() => {
    if (dragging) {
      const handleMouseMove = (e: MouseEvent) => handleMove(e as any)
      const handleMouseUp = () => handleEnd()
      const handleTouchMove = (e: TouchEvent) => handleMove(e as any)
      const handleTouchEnd = () => handleEnd()

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [dragging])

  const startPercent = (startTime / duration) * 100
  const endPercent = (endTime / duration) * 100
  const currentPercent = (currentTime / duration) * 100

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>{formatTime(startTime)}</span>
        <span>{formatTime(endTime)}</span>
      </div>

      <div
        ref={trackRef}
        className="relative h-12 bg-gray-200 dark:bg-gray-700 rounded-lg touch-target"
        onMouseDown={(e) => {
          const time = getPositionFromEvent(e)
          onSeek(time)
        }}
        onTouchStart={(e) => {
          const time = getPositionFromEvent(e)
          onSeek(time)
        }}
      >
        {/* Active range */}
        <div
          className="absolute h-full bg-blue-500 dark:bg-blue-600"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />

        {/* Start thumb */}
        <div
          className="absolute top-0 w-4 h-full bg-blue-700 dark:bg-blue-500 cursor-grab active:cursor-grabbing touch-target"
          style={{ left: `calc(${startPercent}% - 8px)` }}
          onMouseDown={(e) => handleStart('start', e)}
          onTouchStart={(e) => handleStart('start', e)}
        />

        {/* End thumb */}
        <div
          className="absolute top-0 w-4 h-full bg-blue-700 dark:bg-blue-500 cursor-grab active:cursor-grabbing touch-target"
          style={{ left: `calc(${endPercent}% - 8px)` }}
          onMouseDown={(e) => handleStart('end', e)}
          onTouchStart={(e) => handleStart('end', e)}
        />

        {/* Playhead */}
        <div
          className="absolute top-0 w-1 h-full bg-white dark:bg-gray-200 cursor-grab active:cursor-grabbing"
          style={{ left: `${currentPercent}%` }}
          onMouseDown={(e) => handleStart('playhead', e)}
          onTouchStart={(e) => handleStart('playhead', e)}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => {
            onStartTimeChange(currentTime)
            if ('vibrate' in navigator) navigator.vibrate(10)
          }}
          className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg touch-target text-sm"
        >
          Set Start = Now
        </button>
        <button
          onClick={() => {
            onEndTimeChange(currentTime)
            if ('vibrate' in navigator) navigator.vibrate(10)
          }}
          className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg touch-target text-sm"
        >
          Set End = Now
        </button>
      </div>
    </div>
  )
}
