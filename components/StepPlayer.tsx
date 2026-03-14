'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { StepAnnotation } from '@/lib/types'

interface StepPlayerProps {
  videoUrl: string | null
  annotations: StepAnnotation[]
  currentTime: number // in ms
  startTime: number // in ms
  endTime: number // in ms
  onAnnotationUpdate: (id: string, updates: Partial<StepAnnotation>) => void
  onAnnotationDelete: (id: string) => void
  selectedAnnotationId: string | null
  onSelectAnnotation: (id: string | null) => void
  onTimeUpdate?: (time: number) => void
  onDurationUpdate?: (duration: number) => void // Callback when video duration is available
  showControls?: boolean
  seekTime?: number // External seek control
  autoPlay?: boolean
 // Auto-play when true
  /** When true, only show annotations when currentTime is in their [t_start_ms, t_end_ms] (visibility only; does not disable editing). */
  showAnnotationsOnlyInTimeRange?: boolean
  /** Filter by time AND disable drag/rotate (viewer mode). Defaults to showControls when undefined. */
  filterAnnotationsByTime?: boolean
}

export default function StepPlayer({
  videoUrl,
  annotations,
  currentTime,
  startTime,
  endTime,
  onAnnotationUpdate,
  onAnnotationDelete,
  selectedAnnotationId,
  onSelectAnnotation,
  onTimeUpdate,
  onDurationUpdate,
  showControls = false,
  seekTime,
  autoPlay = false,
  showAnnotationsOnlyInTimeRange,
  filterAnnotationsByTime,
}: StepPlayerProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  
  const dragStateRef = useRef<{
    isDragging: boolean
    annotationId: string | null
    startX: number
    startY: number
    startAnnX: number
    startAnnY: number
  } | null>(null)
  
  const rotateStateRef = useRef<{
    isRotating: boolean
    annotationId: string | null
    startAngle: number
    startX: number
    startY: number
  } | null>(null)
  
  const isSeekingRef = useRef(false)

  // Update dimensions when container is laid out or resized (ResizeObserver catches initial layout)
  const updateDimensions = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height })
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    updateDimensions()
    const observer = new ResizeObserver(updateDimensions)
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateDimensions])

  // When video loads (e.g. coming back to SOP), re-measure after layout so annotations show
  useEffect(() => {
    if (!videoUrl) return
    let rafId = 0
    let timeoutId = 0
    rafId = requestAnimationFrame(() => {
      updateDimensions()
      timeoutId = window.setTimeout(updateDimensions, 100)
    })
    return () => {
      cancelAnimationFrame(rafId)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [videoUrl, updateDimensions])

  // Sync video time and play state
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Set initial play state
    setIsPlaying(!video.paused)

    const handleTimeUpdate = () => {
      if (!isSeekingRef.current && onTimeUpdate) {
        onTimeUpdate(Math.round(video.currentTime * 1000))
      }
    }

    const handleLoadedMetadata = () => {
      // Video metadata loaded - duration is now available
      if (video.duration && onDurationUpdate) {
        const durationMs = Math.round(video.duration * 1000)
        onDurationUpdate(durationMs)
        if (process.env.NODE_ENV === 'development') {
          console.log('Video duration loaded:', durationMs, 'ms')
        }
      }
    }

    const handlePlay = () => {
      setIsPlaying(true)
    }
    const handlePause = () => {
      setIsPlaying(false)
    }
    const handleEnded = () => {
      setIsPlaying(false)
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [onTimeUpdate, onDurationUpdate, videoUrl])

  // Handle external seek
  useEffect(() => {
    const video = videoRef.current
    if (!video || seekTime === undefined) return

    const seekSeconds = seekTime / 1000
    if (Math.abs(video.currentTime - seekSeconds) > 0.1) {
      isSeekingRef.current = true
      video.currentTime = seekSeconds
      setTimeout(() => {
        isSeekingRef.current = false
      }, 100)
    }
  }, [seekTime])

  // Handle auto-play
  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoUrl) return

    if (autoPlay) {
      video.play().catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('Autoplay blocked, video will play on user interaction:', err)
        }
      })
    } else {
      video.pause()
    }
  }, [autoPlay, videoUrl])

  // Filter annotations by time for visibility
  // showAnnotationsOnlyInTimeRange: editor can show only in-range (still allow editing when visible)
  // filterAnnotationsByTime / showControls: viewer mode = filter + disable editing
  const shouldFilterByTime =
    showAnnotationsOnlyInTimeRange !== undefined
      ? showAnnotationsOnlyInTimeRange
      : (filterAnnotationsByTime !== undefined ? filterAnnotationsByTime : showControls)

  const visibleAnnotations = shouldFilterByTime
    ? annotations.filter(
        (ann) =>
          (currentTime >= ann.t_start_ms && currentTime <= ann.t_end_ms) ||
          (selectedAnnotationId !== null && ann.id === selectedAnnotationId)
      )
    : annotations // Show all annotations in edit mode

  // Convert normalized coords to pixels
  const normToPixel = (norm: number, dimension: number) => norm * dimension
  const pixelToNorm = (pixel: number, dimension: number) => pixel / dimension

  const getPointerPosition = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { x: number; y: number } | null => {
    if (!svgRef.current) return null
    const rect = svgRef.current.getBoundingClientRect()
    let clientX: number
    let clientY: number
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else if ('clientX' in e) {
      clientX = e.clientX
      clientY = e.clientY
    } else {
      return null
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  // Handle annotation drag start
  const handleAnnotationMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent, annotationId: string) => {
    if (filterAnnotationsByTime) return // Disable dragging in public viewer mode
    
    e.stopPropagation()
    const pos = getPointerPosition(e)
    if (!pos) return

    const ann = annotations.find((a) => a.id === annotationId)
    if (!ann) return

    dragStateRef.current = {
      isDragging: true,
      annotationId,
      startX: pos.x,
      startY: pos.y,
      startAnnX: ann.x,
      startAnnY: ann.y,
    }
    
    onSelectAnnotation(annotationId)
  }, [annotations, onSelectAnnotation, filterAnnotationsByTime])

  // Handle annotation drag move
  const handleAnnotationMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragStateRef.current?.isDragging || filterAnnotationsByTime) return

    const pos = getPointerPosition(e)
    if (!pos || !dragStateRef.current || !dragStateRef.current.annotationId) return

    const { annotationId, startX, startY, startAnnX, startAnnY } = dragStateRef.current
    
    const dx = pos.x - startX
    const dy = pos.y - startY
    
    // Convert pixel delta to normalized delta
    const normDx = pixelToNorm(dx, dimensions.width)
    const normDy = pixelToNorm(dy, dimensions.height)
    
    onAnnotationUpdate(annotationId, {
      x: Math.max(0, Math.min(1, startAnnX + normDx)),
      y: Math.max(0, Math.min(1, startAnnY + normDy)),
    })
  }, [dimensions, onAnnotationUpdate, filterAnnotationsByTime])

  // Handle annotation drag end
  const handleAnnotationMouseUp = useCallback(() => {
    dragStateRef.current = null
  }, [])

  // Handle rotate handle drag
  const handleRotateMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent, annotationId: string) => {
    if (filterAnnotationsByTime) return // Disable rotation in public viewer mode
    
    e.stopPropagation()
    const pos = getPointerPosition(e)
    if (!pos) return

    const ann = annotations.find((a) => a.id === annotationId)
    if (!ann) return

    const centerX = normToPixel(ann.x, dimensions.width)
    const centerY = normToPixel(ann.y, dimensions.height)
    
    const angle = Math.atan2(pos.y - centerY, pos.x - centerX) * (180 / Math.PI)
    
    rotateStateRef.current = {
      isRotating: true,
      annotationId,
      startAngle: angle,
      startX: pos.x,
      startY: pos.y,
    }
  }, [annotations, dimensions, filterAnnotationsByTime])

  // Handle rotate move
  const handleRotateMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!rotateStateRef.current?.isRotating || filterAnnotationsByTime) return

    const pos = getPointerPosition(e)
    if (!pos || !rotateStateRef.current || !rotateStateRef.current.annotationId) return

    const { annotationId, startX, startY } = rotateStateRef.current
    const ann = annotations.find((a) => a.id === annotationId)
    if (!ann) return

    const centerX = normToPixel(ann.x, dimensions.width)
    const centerY = normToPixel(ann.y, dimensions.height)
    
    const angle = Math.atan2(pos.y - centerY, pos.x - centerX) * (180 / Math.PI)
    
    onAnnotationUpdate(annotationId, { angle })
  }, [annotations, dimensions, onAnnotationUpdate, filterAnnotationsByTime])

  // Handle rotate end
  const handleRotateMouseUp = useCallback(() => {
    rotateStateRef.current = null
  }, [])

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const isTouch = 'touches' in e
      if (dragStateRef.current?.isDragging) {
        if (isTouch) e.preventDefault()
        handleAnnotationMouseMove(e)
      }
      if (rotateStateRef.current?.isRotating) {
        if (isTouch) e.preventDefault()
        handleRotateMouseMove(e)
      }
    }
    const handleUp = () => {
      handleAnnotationMouseUp()
      handleRotateMouseUp()
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
    }
  }, [handleAnnotationMouseMove, handleAnnotationMouseUp, handleRotateMouseMove, handleRotateMouseUp])

  const togglePlayPause = () => {
    const video = videoRef.current
    if (!video) return
    
    if (video.paused) {
      video.play()
        .then(() => {
          setIsPlaying(true)
        })
        .catch((err) => {
          console.error('Error playing video:', err)
          setIsPlaying(false)
        })
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  if (!videoUrl) {
    return (
      <div className="w-full aspect-video bg-black rounded-lg flex items-center justify-center text-gray-400">
        No video
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {/* Portrait aspect (9/16) so vertical video fills width with no black sides; larger area */}
      <div
        ref={containerRef}
        className="relative w-full max-w-[min(100%,calc(100dvh*9/16))] mx-auto bg-black overflow-hidden rounded-lg aspect-[9/16] max-h-[78dvh] min-h-[200px] md:max-h-[85vh] md:min-h-[200px]"
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          playsInline
          controls={showControls}
          muted
          loop={false} // Don't loop - let video play through to show all annotations
        />
        {!showControls && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ zIndex: 20 }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                togglePlayPause()
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
              onTouchStart={(e) => {
                e.stopPropagation()
                // Note: preventDefault in touch handlers requires non-passive listener
                // But for a button click, we don't need to prevent default
              }}
              className={`pointer-events-auto w-14 h-14 md:w-16 md:h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center shadow-lg transition-opacity hover:bg-opacity-100 active:scale-95 touch-target ${
                isPlaying ? 'opacity-0 hover:opacity-100 active:opacity-100' : 'opacity-100'
              }`}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              type="button"
            >
              {isPlaying ? (
                <svg className="w-8 h-8 text-black" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg className="w-8 h-8 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
          </div>
        )}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full pointer-events-auto"
          width={dimensions.width || 1}
          height={dimensions.height || 1}
          viewBox={`0 0 ${dimensions.width || 1} ${dimensions.height || 1}`}
          style={{ zIndex: 5, pointerEvents: filterAnnotationsByTime ? 'none' : 'auto' }}
          onClick={(e) => {
            if (filterAnnotationsByTime) return // Disable interaction in public viewer mode
            // Click on empty space deselects
            if (e.target === svgRef.current) {
              onSelectAnnotation(null)
            }
          }}
        >
          {dimensions.width > 0 && dimensions.height > 0 && visibleAnnotations.map((ann) => {
            const x = normToPixel(ann.x, dimensions.width)
            const y = normToPixel(ann.y, dimensions.height)
            const isSelected = ann.id === selectedAnnotationId

            if (ann.kind === 'arrow') {
              const angle = ann.angle ?? 0
              // Make arrows bigger - scale based on video dimensions
              const baseLength = Math.min(dimensions.width, dimensions.height) * 0.15 // 15% of smaller dimension
              const length = Math.max(80, baseLength) // At least 80px, but scale with video size
              const endX = Math.cos((angle * Math.PI) / 180) * length
              const endY = Math.sin((angle * Math.PI) / 180) * length
              const color = isSelected ? '#ff0000' : ann.style?.color || '#00ff00'
              const strokeWidth = ann.style?.strokeWidth || 5

              return (
                <g
                  key={ann.id}
                  transform={`translate(${x}, ${y})`}
                  onMouseDown={(e) => handleAnnotationMouseDown(e, ann.id)}
                  onTouchStart={(e) => handleAnnotationMouseDown(e, ann.id)}
                  style={{ cursor: 'move' }}
                >
                  {/* Invisible wide hit area for easier touch/drag */}
                  <line
                    x1={0}
                    y1={0}
                    x2={endX}
                    y2={endY}
                    stroke="transparent"
                    strokeWidth={32}
                    pointerEvents="stroke"
                  />
                  {/* Arrow line */}
                  <line
                    x1={0}
                    y1={0}
                    x2={endX}
                    y2={endY}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    markerEnd={`url(#arrowhead-${ann.id})`}
                  />
                  {/* Arrowhead marker - bigger for larger arrows */}
                  <defs>
                    <marker
                      id={`arrowhead-${ann.id}`}
                      markerWidth={strokeWidth * 3}
                      markerHeight={strokeWidth * 3}
                      refX={strokeWidth * 2.5}
                      refY={strokeWidth * 1.5}
                      orient="auto"
                    >
                      <polygon
                        points={`0 0, ${strokeWidth * 3} ${strokeWidth * 1.5}, 0 ${strokeWidth * 3}`}
                        fill={color}
                      />
                    </marker>
                  </defs>
                  
                  {/* Rotate handle (when selected) */}
                  {isSelected && !filterAnnotationsByTime && (
                    <g
                      transform={`translate(${endX}, ${endY})`}
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        handleRotateMouseDown(e, ann.id)
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation()
                        handleRotateMouseDown(e, ann.id)
                      }}
                      style={{ cursor: 'grab' }}
                    >
                      <circle
                        cx={0}
                        cy={0}
                        r={12}
                        fill="#ffffff"
                        stroke="#000000"
                        strokeWidth={2}
                        opacity={0.8}
                      />
                      <text
                        x={0}
                        y={0}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={16}
                        fill="#000000"
                      >
                        🔄
                      </text>
                    </g>
                  )}
                </g>
              )
            } else {
              // Label (supports multi-line via \n)
              const color = isSelected ? '#ff0000' : ann.style?.color || '#ffffff'
              const fontSize = ann.style?.fontSize || 28
              const rawText = ann.text || 'Label'
              const lines = rawText.split('\n')
              const lineHeight = fontSize * 1.2
              const charWidth = fontSize * 0.55
              const maxLineLen = Math.max(...lines.map((l) => l.length), 1)
              const blockWidth = maxLineLen * charWidth
              const blockHeight = lines.length * lineHeight + 12

              return (
                <g
                  key={ann.id}
                  transform={`translate(${x}, ${y})`}
                  onMouseDown={filterAnnotationsByTime ? undefined : (e) => handleAnnotationMouseDown(e, ann.id)}
                  onTouchStart={filterAnnotationsByTime ? undefined : (e) => handleAnnotationMouseDown(e, ann.id)}
                  style={{ cursor: filterAnnotationsByTime ? 'default' : 'move', pointerEvents: filterAnnotationsByTime ? 'none' : 'auto' }}
                >
                  {/* Text background */}
                  <rect
                    x={-blockWidth / 2}
                    y={-blockHeight / 2}
                    width={blockWidth}
                    height={blockHeight}
                    fill={isSelected ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.5)'}
                    rx={4}
                  />
                  {/* Text (multi-line) */}
                  <text
                    x={0}
                    y={-(lines.length - 1) * (lineHeight / 2)}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fill={color}
                    stroke={isSelected ? '#ff0000' : '#000000'}
                    strokeWidth={2}
                    paintOrder="stroke"
                  >
                    {lines.map((line, i) => (
                      <tspan key={i} x={0} dy={i === 0 ? 0 : lineHeight}>
                        {line || ' '}
                      </tspan>
                    ))}
                  </text>
                </g>
              )
            }
          })}
        </svg>
      </div>
    </div>
  )
}
