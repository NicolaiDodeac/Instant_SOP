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
    // Don't preventDefault on touch start - it's passive and not needed
    // Scrolling prevention is handled by the document-level touchmove listener
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

  // Prevent division by zero
  const safeDuration = duration > 0 ? duration : 1
  const startPercent = (startTime / safeDuration) * 100
  const endPercent = (endTime / safeDuration) * 100
  const currentPercent = (currentTime / safeDuration) * 100

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <div className="flex flex-col">
          <span className="text-xs text-gray-500">Start: {formatTime(startTime)}</span>
          <span className="font-semibold text-base">Now: {formatTime(currentTime)}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-500">End: {formatTime(endTime)}</span>
          <span className="text-xs text-gray-500">Total: {formatTime(duration)}</span>
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-12 bg-gray-200 dark:bg-gray-700 rounded-lg touch-target"
        onMouseDown={(e) => {
          const time = getPositionFromEvent(e)
          onSeek(time)
        }}
        onTouchStart={(e) => {
          // Don't preventDefault - let the touch event be passive
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

        {/* Playhead - white line showing current position */}
        <div
          className="absolute top-0 w-1 h-full bg-white dark:bg-gray-200 cursor-grab active:cursor-grabbing z-10 shadow-lg"
          style={{ left: `${currentPercent}%` }}
          onMouseDown={(e) => handleStart('playhead', e)}
          onTouchStart={(e) => handleStart('playhead', e)}
        >
          {/* Playhead indicator dot */}
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white dark:bg-gray-200 rounded-full border-2 border-gray-800 dark:border-gray-300"></div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => {
            onStartTimeChange(currentTime)
            if ('vibrate' in navigator) navigator.vibrate(10)
          }}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg touch-target text-sm font-semibold"
        >
          Set Start = {formatTime(currentTime)}
        </button>
        <button
          onClick={() => {
            onEndTimeChange(currentTime)
            if ('vibrate' in navigator) navigator.vibrate(10)
          }}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg touch-target text-sm font-semibold"
        >
          Set End = {formatTime(currentTime)}
        </button>
      </div>
      
      {/* Visual indicator showing what will be selected */}
      {duration > 0 && (
        <div className="text-xs text-center text-gray-500 dark:text-gray-400">
          Selected range: {formatTime(endTime - startTime)} ({formatTime(startTime)} → {formatTime(endTime)})
        </div>
      )}
    </div>
  )
}
