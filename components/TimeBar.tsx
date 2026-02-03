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
  disabled?: boolean
}

export default function TimeBar({
  duration,
  currentTime,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  onSeek,
  disabled = false,
}: TimeBarProps) {
  const [dragging, setDragging] = useState<'start' | 'end' | 'playhead' | null>(null)
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

  // Get time from mouse/touch position
  const getTimeFromPosition = (clientX: number): number => {
    if (!trackRef.current) return 0
    const rect = trackRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const time = Math.round(percentage * duration)
    return Math.max(0, Math.min(time, duration))
  }

  // Handle mouse/touch move during drag
  useEffect(() => {
    if (!dragging) return

    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (!trackRef.current) {
        console.warn('Track ref not available during drag')
        return
      }

      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
      const time = getTimeFromPosition(clientX)
      const snapped = Math.round(time / 100) * 100
      const clampedTime = Math.max(0, Math.min(snapped, duration))
      
      console.log('Dragging:', dragging, 'time:', clampedTime, 'duration:', duration, 'startTime:', startTime, 'endTime:', endTime)

      if (dragging === 'start') {
        // Allow start to be anywhere before end (with minimum 100ms gap)
        const newStart = Math.min(clampedTime, Math.max(0, endTime - 100))
        console.log('Updating start to:', newStart, 'from:', startTime, 'endTime:', endTime)
        if (newStart !== startTime) {
          onStartTimeChange(newStart)
          onSeek(newStart)
        }
      } else if (dragging === 'end') {
        // Allow end to be anywhere after start (with minimum 100ms gap)
        const newEnd = Math.max(clampedTime, Math.min(duration, startTime + 100))
        console.log('Updating end to:', newEnd, 'from:', endTime, 'startTime:', startTime)
        if (newEnd !== endTime) {
          onEndTimeChange(newEnd)
          onSeek(newEnd)
        }
      } else if (dragging === 'playhead') {
        console.log('Seeking to:', clampedTime)
        onSeek(clampedTime)
      }
    }

    const handleEnd = () => {
      setDragging(null)
    }

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
  }, [dragging, duration, startTime, endTime, onStartTimeChange, onEndTimeChange, onSeek])

  // Generate ruler ticks
  const getRulerTicks = () => {
    if (duration <= 0) return { major: [], minor: [] }
    
    const majorTicks: { time: number; label: string }[] = []
    const minorTicks: number[] = []
    
    let majorInterval: number
    if (duration < 10000) {
      majorInterval = 1000
    } else if (duration < 60000) {
      majorInterval = 5000
    } else {
      majorInterval = 10000
    }
    
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
      for (let j = 1; j < 5; j++) {
        minorTicks.push(start + interval * j)
      }
    }
    
    return { major: majorTicks, minor: minorTicks }
  }

  const safeDuration = duration > 0 ? duration : 1
  const startPercent = (startTime / safeDuration) * 100
  const endPercent = (endTime / safeDuration) * 100
  const currentPercent = (currentTime / safeDuration) * 100
  const { major, minor } = getRulerTicks()

  const handleLineMouseDown = (type: 'start' | 'end' | 'playhead', e: React.MouseEvent) => {
    // Only block start/end when disabled, playhead should always work
    if (disabled && (type === 'start' || type === 'end')) return
    e.preventDefault()
    e.stopPropagation()
    console.log('Dragging started:', type, { duration, currentTime, startTime, endTime })
    setDragging(type)
    if ('vibrate' in navigator) navigator.vibrate(10)
  }

  const handleLineTouchStart = (type: 'start' | 'end' | 'playhead', e: React.TouchEvent) => {
    // Only block start/end when disabled, playhead should always work
    if (disabled && (type === 'start' || type === 'end')) return
    e.preventDefault()
    e.stopPropagation()
    console.log('Touch dragging started:', type, { duration, currentTime, startTime, endTime })
    setDragging(type)
    if ('vibrate' in navigator) navigator.vibrate(10)
  }

  const handleTimelineClick = (e: React.MouseEvent) => {
    // Don't seek if we're dragging a line
    if (dragging) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    // Always allow clicking timeline to seek
    if (!trackRef.current) {
      console.warn('Track ref not available')
      return
    }
    const time = getTimeFromPosition(e.clientX)
    console.log('Timeline clicked, seeking to:', time, { duration })
    onSeek(time)
  }

  const handleTimelineTouch = (e: React.TouchEvent) => {
    // Don't seek if we're dragging a line
    if (dragging) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    // Always allow touching timeline to seek
    if (!trackRef.current) {
      console.warn('Track ref not available')
      return
    }
    const time = getTimeFromPosition(e.touches[0].clientX)
    console.log('Timeline touched, seeking to:', time, { duration })
    onSeek(time)
  }

  // Debug: log when component renders
  useEffect(() => {
    console.log('TimeBar rendered:', { duration, currentTime, startTime, endTime, disabled })
  }, [duration, currentTime, startTime, endTime, disabled])

  if (duration <= 0) {
    return (
      <div className="w-full p-4 text-center text-gray-500 dark:text-gray-400">
        <p>Video duration not available. Please record or upload a video first.</p>
        <p className="text-xs mt-2">Duration: {duration}ms</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-2">
      {/* Time info */}
      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 px-1">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-xs font-medium">Start: {formatTime(startTime)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-xs font-medium">End: {formatTime(endTime)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-semibold text-base">Now: {formatTime(currentTime)}</span>
          <span className="text-xs text-gray-500">Total: {formatTime(duration)}</span>
        </div>
      </div>

      {/* Ruler */}
      <div className="relative w-full bg-white dark:bg-gray-900 border-t border-b border-gray-300 dark:border-gray-700 py-2">
        <div
          ref={trackRef}
          className="relative w-full h-20 select-none"
          onClick={(e) => {
            // Don't seek if clicking on a draggable line
            if ((e.target as HTMLElement).closest('[data-draggable-line]')) {
              return
            }
            handleTimelineClick(e)
          }}
          onTouchStart={(e) => {
            // Don't seek if touching a draggable line
            if ((e.target as HTMLElement).closest('[data-draggable-line]')) {
              return
            }
            handleTimelineTouch(e)
          }}
        >
          {/* Ruler line */}
          <div className="absolute top-8 left-0 right-0 h-0.5 bg-gray-400 dark:bg-gray-600"></div>

          {/* Minor ticks */}
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

          {/* Major ticks */}
          {major.map(({ time, label }) => {
            const percent = (time / safeDuration) * 100
            return (
              <div
                key={`major-${time}`}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
              >
                <div className="w-px h-8 bg-gray-700 dark:bg-gray-300"></div>
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

          {/* Start line */}
          <div
            data-draggable-line="start"
            className={`absolute top-0 w-4 h-full z-20 ${
              disabled
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-grab active:cursor-grabbing'
            }`}
            style={{ 
              left: `${startPercent}%`,
              transform: 'translateX(-50%)',
              pointerEvents: disabled ? 'none' : 'auto',
              touchAction: 'none',
            }}
            onMouseDown={(e) => {
              console.log('Start line mousedown, disabled:', disabled, 'startPercent:', startPercent)
              e.stopPropagation()
              handleLineMouseDown('start', e)
            }}
            onTouchStart={(e) => {
              console.log('Start line touchstart, disabled:', disabled)
              e.stopPropagation()
              handleLineTouchStart('start', e)
            }}
          >
            {/* Vertical line */}
            <div
              className={`absolute top-0 left-1/2 w-1 h-full ${
                disabled ? 'bg-gray-400 dark:bg-gray-600' : 'bg-green-500'
              }`}
              style={{ transform: 'translateX(-50%)' }}
            />
            {/* Triangle indicator */}
            <div
              className={`absolute top-8 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${
                disabled ? 'border-gray-400' : 'border-green-500'
              }`}
              style={{
                width: 0,
                height: 0,
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderTop: `20px solid ${disabled ? '#9ca3af' : '#10b981'}`,
                pointerEvents: 'none',
              }}
            />
            {!disabled && (
              <div className="absolute top-12 left-1/2 transform -translate-x-1/2 text-[10px] font-bold text-green-600 dark:text-green-400 whitespace-nowrap pointer-events-none">
                START
              </div>
            )}
          </div>

          {/* End line */}
          <div
            data-draggable-line="end"
            className={`absolute top-0 w-4 h-full z-20 ${
              disabled
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-grab active:cursor-grabbing'
            }`}
            style={{ 
              left: `${endPercent}%`,
              transform: 'translateX(-50%)',
              pointerEvents: disabled ? 'none' : 'auto',
              touchAction: 'none',
            }}
            onMouseDown={(e) => {
              console.log('End line mousedown, disabled:', disabled, 'endPercent:', endPercent)
              e.stopPropagation()
              handleLineMouseDown('end', e)
            }}
            onTouchStart={(e) => {
              console.log('End line touchstart, disabled:', disabled)
              e.stopPropagation()
              handleLineTouchStart('end', e)
            }}
          >
            {/* Vertical line */}
            <div
              className={`absolute top-0 left-1/2 w-1 h-full ${
                disabled ? 'bg-gray-400 dark:bg-gray-600' : 'bg-red-500'
              }`}
              style={{ transform: 'translateX(-50%)' }}
            />
            {/* Triangle indicator */}
            <div
              className={`absolute top-8 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${
                disabled ? 'border-gray-400' : 'border-red-500'
              }`}
              style={{
                width: 0,
                height: 0,
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderTop: `20px solid ${disabled ? '#9ca3af' : '#ef4444'}`,
                pointerEvents: 'none',
              }}
            />
            {!disabled && (
              <div className="absolute top-12 left-1/2 transform -translate-x-1/2 text-[10px] font-bold text-red-600 dark:text-red-400 whitespace-nowrap pointer-events-none">
                END
              </div>
            )}
          </div>

          {/* Playhead */}
          <div
            data-draggable-line="playhead"
            className="absolute top-0 w-2 h-full bg-white dark:bg-gray-200 cursor-grab active:cursor-grabbing z-30 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-300"
            style={{ 
              left: `${currentPercent}%`,
              transform: 'translateX(-50%)',
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              handleLineMouseDown('playhead', e)
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
              handleLineTouchStart('playhead', e)
            }}
          >
            <div
              className="absolute top-8 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
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

      {/* Buttons */}
      {!disabled && (
        <div className="flex gap-2">
          <button
            onClick={() => {
              onStartTimeChange(currentTime)
              onSeek(currentTime)
              if ('vibrate' in navigator) navigator.vibrate(10)
            }}
            className="flex-1 py-2 px-4 rounded-lg touch-target text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
          >
            Set Start = {formatTime(currentTime)}
          </button>
          <button
            onClick={() => {
              onEndTimeChange(currentTime)
              onSeek(currentTime)
              if ('vibrate' in navigator) navigator.vibrate(10)
            }}
            className="flex-1 py-2 px-4 rounded-lg touch-target text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            Set End = {formatTime(currentTime)}
          </button>
        </div>
      )}
      
      {/* Info */}
      {duration > 0 && (
        <div className="text-xs text-center text-gray-500 dark:text-gray-400">
          {disabled ? (
            <span className="text-amber-600 dark:text-amber-400">
              Select an annotation (arrow or label) to edit its timeline
            </span>
          ) : (
            <>
              Range: {formatTime(endTime - startTime)} ({formatTime(startTime)} → {formatTime(endTime)})
            </>
          )}
        </div>
      )}
    </div>
  )
}



