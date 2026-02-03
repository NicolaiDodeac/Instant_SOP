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
  showControls?: boolean
  seekTime?: number // External seek control
  autoPlay?: boolean // Auto-play when true
  filterAnnotationsByTime?: boolean // Filter annotations by time range (defaults to showControls)
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
  showControls = false,
  seekTime,
  autoPlay = false,
  filterAnnotationsByTime,
}: StepPlayerProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  
  // Drag state
  const dragStateRef = useRef<{
    isDragging: boolean
    annotationId: string | null
    startX: number
    startY: number
    startAnnX: number
    startAnnY: number
  } | null>(null)
  
  // Rotate state
  const rotateStateRef = useRef<{
    isRotating: boolean
    annotationId: string | null
    startAngle: number
    startX: number
    startY: number
  } | null>(null)
  
  // Pan state (for zoom panning)
  const panStateRef = useRef<{
    isPanning: boolean
    startX: number
    startY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)
  
  // Pinch state
  const pinchStateRef = useRef<{
    distance: number
    scale: number
    centerX: number
    centerY: number
  } | null>(null)
  
  const isSeekingRef = useRef(false)

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: rect.height })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

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
      if (onTimeUpdate && video.duration) {
        // Optionally notify parent of duration if needed
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
  }, [onTimeUpdate, videoUrl])

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

  // Filter annotations by time
  // In edit mode (showControls=false), show all annotations so user can position them
  // In view mode (showControls=true or filterAnnotationsByTime=true), only show annotations in their time range
  const shouldFilterByTime = filterAnnotationsByTime !== undefined
    ? filterAnnotationsByTime
    : showControls

  const visibleAnnotations = shouldFilterByTime
    ? annotations.filter(
        (ann) => currentTime >= ann.t_start_ms && currentTime <= ann.t_end_ms
      )
    : annotations // Show all annotations in edit mode

  // Convert normalized coords to pixels
  const normToPixel = (norm: number, dimension: number) => norm * dimension
  const pixelToNorm = (pixel: number, dimension: number) => pixel / dimension

  // Get pointer position relative to SVG (accounting for transform)
  const getPointerPosition = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { x: number; y: number } | null => {
    if (!svgRef.current) return null
    
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    
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
    
    // Get position relative to SVG viewport
    const svgX = clientX - rect.left
    const svgY = clientY - rect.top
    
    // Account for SVG transform (scale and pan)
    // The transform is applied via CSS: scale(scale) translate(panOffset.x/scale, panOffset.y/scale)
    // So we need to reverse it
    const x = (svgX - panOffset.x) / scale
    const y = (svgY - panOffset.y) / scale
    
    return { x, y }
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
  }, [annotations, onSelectAnnotation, scale, panOffset, filterAnnotationsByTime])

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
  }, [dimensions, onAnnotationUpdate, scale, panOffset, filterAnnotationsByTime])

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
  }, [annotations, dimensions, scale, panOffset, filterAnnotationsByTime])

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
  }, [annotations, dimensions, onAnnotationUpdate, scale, panOffset, filterAnnotationsByTime])

  // Handle rotate end
  const handleRotateMouseUp = useCallback(() => {
    rotateStateRef.current = null
  }, [])

  // Global mouse/touch handlers for dragging
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (dragStateRef.current?.isDragging) {
        handleAnnotationMouseMove(e)
      }
      if (rotateStateRef.current?.isRotating) {
        handleRotateMouseMove(e)
      }
      if (panStateRef.current?.isPanning) {
        handlePanMove(e)
      }
    }

    const handleUp = () => {
      handleAnnotationMouseUp()
      handleRotateMouseUp()
      handlePanEnd()
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

  // Pan handlers (for zoom panning)
  const handlePanStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (filterAnnotationsByTime || dragStateRef.current || rotateStateRef.current) return // Disable pan in public viewer mode
    
    const pos = getPointerPosition(e)
    if (!pos) return

    panStateRef.current = {
      isPanning: true,
      startX: pos.x * scale,
      startY: pos.y * scale,
      startOffsetX: panOffset.x,
      startOffsetY: panOffset.y,
    }
  }, [scale, panOffset, filterAnnotationsByTime])

  const handlePanMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!panStateRef.current?.isPanning) return

    const pos = getPointerPosition(e)
    if (!pos || !panStateRef.current) return

    const { startX, startY, startOffsetX, startOffsetY } = panStateRef.current
    
    const dx = (pos.x * scale) - startX
    const dy = (pos.y * scale) - startY
    
    setPanOffset({
      x: startOffsetX + dx,
      y: startOffsetY + dy,
    })
  }, [scale])

  const handlePanEnd = useCallback(() => {
    panStateRef.current = null
  }, [])

  // Pinch handlers
  const handlePinchStart = useCallback((e: React.TouchEvent) => {
    if (filterAnnotationsByTime) return // Disable pinch in public viewer mode
    
    if (e.touches.length === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      const centerX = (touch1.clientX + touch2.clientX) / 2
      const centerY = (touch1.clientY + touch2.clientY) / 2
      
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect()
        pinchStateRef.current = {
          distance,
          scale,
          centerX: centerX - rect.left,
          centerY: centerY - rect.top,
        }
      }
    }
  }, [scale, filterAnnotationsByTime])

  const handlePinchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStateRef.current) {
      e.preventDefault()
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      
      const newScale = (distance / pinchStateRef.current.distance) * pinchStateRef.current.scale
      setScale(Math.max(0.5, Math.min(3, newScale)))
    }
  }, [])

  const handlePinchEnd = useCallback(() => {
    pinchStateRef.current = null
  }, [])

  const handleDoubleTap = () => {
    setScale(1)
    setPanOffset({ x: 0, y: 0 })
  }

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
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative w-full bg-black rounded-lg overflow-hidden"
        style={{ aspectRatio: '16/9' }}
        onDoubleClick={handleDoubleTap}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          playsInline
          controls={showControls}
          muted={!showControls} // Mute in autoplay mode (required by browsers), unmuted when controls are shown
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
              className={`pointer-events-auto w-16 h-16 bg-white bg-opacity-80 rounded-full flex items-center justify-center shadow-lg transition-opacity hover:bg-opacity-100 touch-target ${
                isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'
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
          width={dimensions.width}
          height={dimensions.height}
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          style={{
            transform: `scale(${scale}) translate(${panOffset.x / scale}px, ${panOffset.y / scale}px)`,
            transformOrigin: 'top left',
            zIndex: 5,
            pointerEvents: filterAnnotationsByTime ? 'none' : 'auto', // Disable all pointer events in viewer mode
          }}
          onMouseDown={handlePanStart}
          onTouchStart={(e) => {
            if (e.touches.length === 1) {
              handlePanStart(e)
            } else if (e.touches.length === 2) {
              handlePinchStart(e)
            }
          }}
          onTouchMove={handlePinchMove}
          onTouchEnd={handlePinchEnd}
          onClick={(e) => {
            if (filterAnnotationsByTime) return // Disable interaction in public viewer mode
            // Click on empty space deselects
            if (e.target === svgRef.current) {
              onSelectAnnotation(null)
            }
          }}
        >
          {visibleAnnotations.map((ann) => {
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
              // Label
              const color = isSelected ? '#ff0000' : ann.style?.color || '#ffffff'
              const fontSize = ann.style?.fontSize || 20
              const text = ann.text || 'Label'

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
                    x={-text.length * (fontSize * 0.3)}
                    y={-fontSize / 2}
                    width={text.length * (fontSize * 0.6)}
                    height={fontSize + 16}
                    fill={isSelected ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.5)'}
                    rx={4}
                  />
                  {/* Text */}
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fontSize}
                    fill={color}
                    stroke={isSelected ? '#ff0000' : '#000000'}
                    strokeWidth={2}
                    paintOrder="stroke"
                  >
                    {text}
                  </text>
                </g>
              )
            }
          })}
        </svg>
      </div>

      {!filterAnnotationsByTime && ( // Only show zoom controls in editor mode
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>Zoom: {Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(Math.max(0.5, scale - 0.25))}
            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded touch-target"
          >
            −
          </button>
          <button
            onClick={() => {
              setScale(1)
              setPanOffset({ x: 0, y: 0 })
            }}
            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded touch-target"
          >
            Reset
          </button>
          <button
            onClick={() => setScale(Math.min(3, scale + 0.25))}
            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded touch-target"
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}
