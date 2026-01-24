'use client'

import { useEffect, useRef, useState } from 'react'
import type { StepAnnotation } from '@/lib/types'
import type Konva from 'konva'
import type { Stage as StageType } from 'konva/lib/Stage'

type ReactKonvaModule = typeof import('react-konva')

function useReactKonva() {
  const [rk, setRk] = useState<ReactKonvaModule | null>(null)

  useEffect(() => {
    let mounted = true
    import('react-konva').then((mod) => {
      if (mounted) setRk(mod)
    })
    return () => {
      mounted = false
    }
  }, [])

  return rk
}

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
}: StepPlayerProps) {
  const rk = useReactKonva()

  if (!rk) {
    return (
      <div className="w-full aspect-video bg-black rounded-lg flex items-center justify-center text-gray-400">
        Loading player…
      </div>
    )
  }

  const { Stage, Layer, Arrow, Text, Group } = rk

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<StageType | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const rotateStartRef = useRef<number | null>(null)
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null)
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

  // Sync video time
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      if (!isSeekingRef.current && onTimeUpdate) {
        onTimeUpdate(Math.round(video.currentTime * 1000))
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => video.removeEventListener('timeupdate', handleTimeUpdate)
  }, [onTimeUpdate])

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

  // Filter annotations by time
  const visibleAnnotations = annotations.filter(
    (ann) => currentTime >= ann.t_start_ms && currentTime <= ann.t_end_ms
  )

  // Convert normalized coords to pixels
  const normToPixel = (norm: number, dimension: number) => norm * dimension

  const handleAnnotationDragStart = (e: any, id: string) => {
    const stage = e.target.getStage()
    const pointerPos = stage.getPointerPosition()
    dragStartRef.current = pointerPos
    onSelectAnnotation(id)
  }

  const handleAnnotationDrag = (e: any, id: string) => {
    if (!dragStartRef.current) return

    const stage = e.target.getStage()
    const pointerPos = stage.getPointerPosition()
    const dx = pointerPos.x - dragStartRef.current.x
    const dy = pointerPos.y - dragStartRef.current.y

    // Convert pixel delta to normalized delta
    const normDx = dx / dimensions.width
    const normDy = dy / dimensions.height

    const ann = annotations.find((a) => a.id === id)
    if (ann) {
      onAnnotationUpdate(id, {
        x: Math.max(0, Math.min(1, ann.x + normDx)),
        y: Math.max(0, Math.min(1, ann.y + normDy)),
      })
    }

    dragStartRef.current = pointerPos
  }

  const handleAnnotationDragEnd = () => {
    dragStartRef.current = null
  }

  const handleRotate = (e: any, id: string) => {
    const stage = e.target.getStage()
    const pointerPos = stage.getPointerPosition()
    const ann = annotations.find((a) => a.id === id)
    if (!ann) return

    const centerX = normToPixel(ann.x, dimensions.width)
    const centerY = normToPixel(ann.y, dimensions.height)

    const angle = Math.atan2(
      pointerPos.y - centerY,
      pointerPos.x - centerX
    ) * (180 / Math.PI)

    onAnnotationUpdate(id, { angle })
  }

  const handlePinchStart = (e: any) => {
    e.evt.preventDefault()
    const touches = e.evt.touches
    if (touches.length === 2) {
      const touch1 = touches[0]
      const touch2 = touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      pinchStartRef.current = { distance, scale }
    }
  }

  const handlePinchMove = (e: any) => {
    e.evt.preventDefault()
    const touches = e.evt.touches
    if (touches.length === 2 && pinchStartRef.current) {
      const touch1 = touches[0]
      const touch2 = touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      const newScale = (distance / pinchStartRef.current.distance) * scale
      setScale(Math.max(0.5, Math.min(3, newScale)))
    }
  }

  const handlePinchEnd = () => {
    pinchStartRef.current = null
  }

  const handleDoubleTap = () => {
    setScale(1)
    setStagePos({ x: 0, y: 0 })
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
        />
        <div className="absolute inset-0 pointer-events-none">
          <Stage
            ref={stageRef}
            width={dimensions.width}
            height={dimensions.height}
            scaleX={scale}
            scaleY={scale}
            x={stagePos.x}
            y={stagePos.y}
            onTouchStart={handlePinchStart}
            onTouchMove={handlePinchMove}
            onTouchEnd={handlePinchEnd}
            className="pointer-events-auto"
          >
            <Layer>
              {visibleAnnotations.map((ann) => {
                const x = normToPixel(ann.x, dimensions.width)
                const y = normToPixel(ann.y, dimensions.height)
                const isSelected = ann.id === selectedAnnotationId

                if (ann.kind === 'arrow') {
                  const angle = ann.angle ?? 0
                  const length = 50
                  const endX = Math.cos((angle * Math.PI) / 180) * length
                  const endY = Math.sin((angle * Math.PI) / 180) * length

                  return (
                    <Group
                      key={ann.id}
                      x={x}
                      y={y}
                      draggable
                      onDragStart={(e) => handleAnnotationDragStart(e, ann.id)}
                      onDragMove={(e) => handleAnnotationDrag(e, ann.id)}
                      onDragEnd={handleAnnotationDragEnd}
                      onClick={() => onSelectAnnotation(ann.id)}
                      onTap={() => onSelectAnnotation(ann.id)}
                    >
                      <Arrow
                        points={[0, 0, endX, endY]}
                        stroke={isSelected ? '#ff0000' : ann.style?.color || '#00ff00'}
                        strokeWidth={ann.style?.strokeWidth || 3}
                        fill={isSelected ? '#ff0000' : ann.style?.color || '#00ff00'}
                      />
                      {isSelected && (
                        <Group
                          x={endX}
                          y={endY}
                          draggable
                          onDragMove={(e) => {
                            const stage = e.target.getStage()
                            if (stage) {
                              const pointerPos = stage.getPointerPosition()
                              if (pointerPos) {
                                handleRotate(e, ann.id)
                              }
                            }
                          }}
                        >
                          <Text
                            text="🔄"
                            fontSize={24}
                            offsetX={12}
                            offsetY={12}
                            fill="#ffffff"
                          />
                        </Group>
                      )}
                    </Group>
                  )
                } else {
                  // Label
                  return (
                    <Group
                      key={ann.id}
                      x={x}
                      y={y}
                      draggable
                      onDragStart={(e) => handleAnnotationDragStart(e, ann.id)}
                      onDragMove={(e) => handleAnnotationDrag(e, ann.id)}
                      onDragEnd={handleAnnotationDragEnd}
                      onClick={() => onSelectAnnotation(ann.id)}
                      onTap={() => onSelectAnnotation(ann.id)}
                    >
                      <Text
                        text={ann.text || 'Label'}
                        fontSize={ann.style?.fontSize || 20}
                        fill={isSelected ? '#ff0000' : ann.style?.color || '#ffffff'}
                        stroke={isSelected ? '#ff0000' : '#000000'}
                        strokeWidth={2}
                        padding={8}
                        align="center"
                      />
                    </Group>
                  )
                }
              })}
            </Layer>
          </Stage>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>Zoom: {Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale(Math.max(0.5, scale - 0.25))}
          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded touch-target"
        >
          −
        </button>
        <button
          onClick={() => setScale(1)}
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
    </div>
  )
}
