'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

export type TimelineDragMode = 'seek' | 'setStart' | 'setEnd'

interface TimeBarProps {
  duration: number // in ms
  currentTime: number // in ms
  startTime: number // in ms
  endTime: number // in ms
  onStartTimeChange: (time: number) => void
  onEndTimeChange: (time: number) => void
  onSeek: (time: number) => void
  /** When set, dragging the white arrow updates start or end instead of just seeking. */
  dragMode?: TimelineDragMode
  onDragModeChange?: (mode: TimelineDragMode) => void
  disabled?: boolean
  /** Optional hint when editing a selected annotation (e.g. "Editing selected arrow") */
  selectionHint?: string
}

export default function TimeBar({
  duration,
  currentTime,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  onSeek,
  dragMode = 'seek',
  onDragModeChange,
  disabled = false,
  selectionHint,
}: TimeBarProps) {
  const [dragging, setDragging] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatTimeShort = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    return `${secs}s`
  }

  const getTimeFromPosition = (clientX: number): number => {
    if (!trackRef.current) return 0
    const rect = trackRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const time = Math.round(percentage * duration)
    return Math.max(0, Math.min(time, duration))
  }

  useEffect(() => {
    if (!dragging) return

    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!trackRef.current) return

      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
      const time = getTimeFromPosition(clientX)
      const snapped = Math.round(time / 100) * 100
      const clampedTime = Math.max(0, Math.min(snapped, duration))

      onSeek(clampedTime)
      if (dragMode === 'setStart') {
        const newStart = Math.min(clampedTime, Math.max(0, endTime - 100))
        onStartTimeChange(newStart)
      } else if (dragMode === 'setEnd') {
        const newEnd = Math.max(clampedTime, Math.min(duration, startTime + 100))
        onEndTimeChange(newEnd)
      }
    }

    const handleEnd = () => setDragging(false)

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleEnd)
    document.addEventListener('touchmove', handleMove, { passive: false })
    document.addEventListener('touchend', handleEnd)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleEnd)
      document.removeEventListener('touchmove', handleMove)
      document.removeEventListener('touchend', handleEnd)
    }
  }, [dragging, duration, startTime, endTime, dragMode, onStartTimeChange, onEndTimeChange, onSeek])

  const { major, minor } = useMemo(() => {
    if (duration <= 0) return { major: [] as { time: number; label: string }[], minor: [] as number[] }
    const majorTicks: { time: number; label: string }[] = []
    const minorTicks: number[] = []
    let majorInterval: number
    if (duration < 10000) majorInterval = 1000
    else if (duration < 60000) majorInterval = 5000
    else majorInterval = 10000
    for (let time = 0; time <= duration; time += majorInterval) {
      majorTicks.push({ time, label: formatTimeShort(time) })
    }
    if (majorTicks[majorTicks.length - 1]?.time !== duration) {
      majorTicks.push({ time: duration, label: formatTimeShort(duration) })
    }
    for (let i = 0; i < majorTicks.length - 1; i++) {
      const start = majorTicks[i].time
      const end = majorTicks[i + 1].time
      const interval = (end - start) / 5
      for (let j = 1; j < 5; j++) minorTicks.push(start + interval * j)
    }
    return { major: majorTicks, minor: minorTicks }
  }, [duration])

  const safeDuration = duration > 0 ? duration : 1
  const startPercent = (startTime / safeDuration) * 100
  const endPercent = (endTime / safeDuration) * 100
  const currentPercent = (currentTime / safeDuration) * 100

  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
    if ('vibrate' in navigator) navigator.vibrate(10)
  }

  const handlePlayheadTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
    if ('vibrate' in navigator) navigator.vibrate(10)
  }

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (dragging) return
    if ((e.target as HTMLElement).closest('[data-draggable-line]')) return
    if (!trackRef.current) return
    const time = getTimeFromPosition(e.clientX)
    onSeek(time)
    onDragModeChange?.('seek')
  }

  const handleTimelineTouch = (e: React.TouchEvent) => {
    if (dragging) return
    if ((e.target as HTMLElement).closest('[data-draggable-line]')) return
    if (!trackRef.current) return
    const time = getTimeFromPosition(e.touches[0].clientX)
    onSeek(time)
    onDragModeChange?.('seek')
  }

  const handleSetStart = () => {
    onStartTimeChange(currentTime)
    onSeek(currentTime)
    onDragModeChange?.('setStart')
    if ('vibrate' in navigator) navigator.vibrate(10)
  }

  const handleSetEnd = () => {
    onEndTimeChange(currentTime)
    onSeek(currentTime)
    onDragModeChange?.('setEnd')
    if ('vibrate' in navigator) navigator.vibrate(10)
  }

  if (duration <= 0) {
    return (
      <div className="w-full p-4 text-center text-gray-500 dark:text-gray-400">
        <p>Video duration not available. Please record or upload a video first.</p>
        <p className="text-xs mt-2">Duration: {duration}ms</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 px-0.5 gap-1">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-green-500 rounded-full shrink-0" />
            <span className="text-xs font-medium truncate">Start: {formatTime(startTime)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-red-500 rounded-full shrink-0" />
            <span className="text-xs font-medium truncate">End: {formatTime(endTime)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="font-semibold text-sm md:text-base tabular-nums">Now: {formatTime(currentTime)}</span>
          <span className="text-xs text-gray-500">Total: {formatTime(duration)}</span>
          {!disabled && dragMode !== 'seek' && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 hidden sm:inline">
              {dragMode === 'setStart' ? 'Moving arrow sets START' : 'Moving arrow sets END'}
            </span>
          )}
        </div>
      </div>

      <div className="relative w-full bg-white dark:bg-gray-900 border-t border-b border-gray-300 dark:border-gray-700 py-1">
        <div
          ref={trackRef}
          className="relative w-full h-14 md:h-16 select-none"
          onClick={handleTimelineClick}
          onTouchStart={handleTimelineTouch}
        >
          <div className="absolute top-8 left-0 right-0 h-0.5 bg-gray-400 dark:bg-gray-600" />

          {minor.map((time) => {
            const percent = (time / safeDuration) * 100
            return (
              <div
                key={`minor-${time}`}
                className="absolute top-8 h-2 w-px bg-gray-400 dark:bg-gray-500"
                style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
              />
            )
          })}

          {major.map(({ time, label }) => {
            const percent = (time / safeDuration) * 100
            return (
              <div
                key={`major-${time}`}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
              >
                <div className="w-px h-8 bg-gray-700 dark:bg-gray-300" />
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-1 whitespace-nowrap">
                  {label}
                </div>
              </div>
            )
          })}

          {/* Selected range */}
          {!disabled && startTime < endTime && (
            <div
              className="absolute top-8 h-2 bg-blue-400 dark:bg-blue-600 opacity-40"
              style={{
                left: `${startPercent}%`,
                width: `${endPercent - startPercent}%`,
                transform: 'translateY(-50%)',
              }}
            />
          )}

          {/* Start line – visual only */}
          <div
            className="absolute top-0 w-px h-full pointer-events-none"
            style={{ left: `${startPercent}%`, transform: 'translateX(-50%)' }}
          >
            <div
              className={`absolute top-0 left-0 w-1 h-full ${disabled ? 'bg-gray-400 dark:bg-gray-600' : 'bg-green-500'}`}
              style={{ transform: 'translateX(-50%)' }}
            />
            <div
              className={`absolute top-8 left-1/2 -translate-x-1/2 -translate-y-1/2 ${disabled ? 'border-gray-400' : 'border-green-500'}`}
              style={{
                width: 0,
                height: 0,
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderTop: `20px solid ${disabled ? '#9ca3af' : '#10b981'}`,
              }}
            />
            {!disabled && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 text-[10px] font-bold text-green-600 dark:text-green-400 whitespace-nowrap">
                START
              </div>
            )}
          </div>

          {/* End line – visual only */}
          <div
            className="absolute top-0 w-px h-full pointer-events-none"
            style={{ left: `${endPercent}%`, transform: 'translateX(-50%)' }}
          >
            <div
              className={`absolute top-0 left-0 w-1 h-full ${disabled ? 'bg-gray-400 dark:bg-gray-600' : 'bg-red-500'}`}
              style={{ transform: 'translateX(-50%)' }}
            />
            <div
              className={`absolute top-8 left-1/2 -translate-x-1/2 -translate-y-1/2 ${disabled ? 'border-gray-400' : 'border-red-500'}`}
              style={{
                width: 0,
                height: 0,
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderTop: `20px solid ${disabled ? '#9ca3af' : '#ef4444'}`,
              }}
            />
            {!disabled && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 text-[10px] font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                END
              </div>
            )}
          </div>

          {/* Single draggable playhead */}
          <div
            data-draggable-line="playhead"
            className="absolute top-0 w-6 h-full cursor-grab active:cursor-grabbing z-10"
            style={{ left: `${currentPercent}%`, transform: 'translateX(-50%)' }}
            onMouseDown={handlePlayheadMouseDown}
            onTouchStart={handlePlayheadTouchStart}
          >
            <div
              className="absolute top-8 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                width: 0,
                height: 0,
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderTop: '16px solid white',
                filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))',
              }}
            />
          </div>
        </div>
      </div>

      {!disabled && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleSetStart}
            className={`flex-1 py-1.5 px-3 rounded-lg touch-target text-sm font-semibold transition-colors ${
              dragMode === 'setStart'
                ? 'ring-2 ring-green-400 ring-offset-2 bg-green-600 hover:bg-green-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            Set Start = {formatTime(currentTime)}
          </button>
          <button
            type="button"
            onClick={handleSetEnd}
            className={`flex-1 py-1.5 px-3 rounded-lg touch-target text-sm font-semibold transition-colors ${
              dragMode === 'setEnd'
                ? 'ring-2 ring-red-400 ring-offset-2 bg-red-600 hover:bg-red-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            Set End = {formatTime(currentTime)}
          </button>
        </div>
      )}

      {duration > 0 && (
        <div className="text-xs text-center text-gray-500 dark:text-gray-400 mt-0.5">
          {disabled ? (
            <span className="text-amber-600 dark:text-amber-400">
              Select an annotation (arrow or label) to edit its timeline
            </span>
          ) : (
            <>
              {selectionHint && (
                <span className="text-green-600 dark:text-green-400 font-medium">{selectionHint}</span>
              )}
              {selectionHint && ' · '}
              Range: {formatTime(endTime - startTime)} ({formatTime(startTime)} → {formatTime(endTime)})
            </>
          )}
        </div>
      )}
    </div>
  )
}
