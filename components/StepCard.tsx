'use client'

import { useEffect, useRef, useState } from 'react'
import type { SOPStep, StepAnnotation } from '@/lib/types'
import StepPlayer from '@/components/StepPlayer'

/** Stored title is often "Step N"; prefer instructions for display. */
const AUTO_STEP_TITLE = /^Step\s+\d+$/i

function stepPrimaryText(step: SOPStep): string {
  const inst = step.instructions?.trim()
  if (inst) return inst
  const t = step.title?.trim() ?? ''
  if (t && !AUTO_STEP_TITLE.test(t)) return t
  return ''
}

interface StepCardProps {
  step: SOPStep
  annotations: StepAnnotation[]
  videoUrl: string | null
  imageUrl?: string | null
  /** Signed URL for video poster (viewer). */
  posterUrl?: string | null
  stepNumber: number
  totalSteps: number
  /** Parent sets true for at most one step: highest viewport intersection ratio ≥ 75%. */
  playbackActive: boolean
  /** Report intersection ratio (0–1) vs viewport; parent picks the single active step. */
  onIntersectionRatio: (ratio: number) => void
}

export default function StepCard({
  step,
  annotations,
  videoUrl,
  imageUrl = null,
  posterUrl = null,
  stepNumber,
  totalSteps,
  playbackActive,
  onIntersectionRatio,
}: StepCardProps) {
  const primary = stepPrimaryText(step)
  const [currentTime, setCurrentTime] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const onRatioRef = useRef(onIntersectionRatio)
  onRatioRef.current = onIntersectionRatio

  // Set time range from annotations
  useEffect(() => {
    if (annotations.length > 0) {
      const firstAnn = annotations[0]
      setStartTime(firstAnn.t_start_ms)
      setEndTime(firstAnn.t_end_ms)
    } else {
      setStartTime(0)
      setEndTime(step.duration_ms || 0)
    }
  }, [annotations, step.duration_ms])

  // Report intersection ratio so parent can enable autoplay only for the single most-visible step (≥75%).
  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        const ratio = entry.isIntersecting ? entry.intersectionRatio : 0
        onRatioRef.current(ratio)
      },
      {
        threshold: Array.from({ length: 21 }, (_, i) => i / 20),
        root: null,
        rootMargin: '0px',
      }
    )

    observer.observe(card)

    return () => {
      observer.disconnect()
    }
  }, [videoUrl, imageUrl, stepNumber])

  return (
    <div
      ref={cardRef}
      className="w-full min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900"
    >
      {/* Step badge + description (same row as editor; number from position) */}
      <div className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start gap-3">
          <div className="flex min-h-9 shrink-0 items-center justify-center self-start rounded bg-blue-600 px-3 py-1.5">
            <span className="text-base font-semibold tabular-nums leading-snug text-white">
              Step {stepNumber}
            </span>
          </div>
          {primary ? (
            <p className="min-w-0 flex-1 whitespace-pre-wrap text-base font-bold leading-snug text-gray-900 dark:text-white">
              {primary}
            </p>
          ) : null}
        </div>
      </div>

      {/* Video or image - Full Width with Rounded Corners */}
      <div className="flex-1 bg-white px-4 pb-4 pt-2 dark:bg-gray-800">
        {videoUrl || imageUrl ? (
          <div className="w-full rounded-lg overflow-hidden shadow-lg bg-black">
            <StepPlayer
              videoUrl={videoUrl}
              imageUrl={imageUrl}
              posterUrl={posterUrl}
              videoPreload={playbackActive || stepNumber === 1 ? 'auto' : 'metadata'}
              annotations={annotations}
              currentTime={currentTime}
              startTime={startTime}
              endTime={endTime}
              onAnnotationUpdate={() => {}}
              onAnnotationDelete={() => {}}
              selectedAnnotationId={null}
              onSelectAnnotation={() => {}}
              onTimeUpdate={setCurrentTime}
              showControls={true}
              autoPlay={playbackActive && !!videoUrl}
              filterAnnotationsByTime={true}
              showRestartButton={!!videoUrl}
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700">
            <div className="text-center">
              <p className="mb-2 text-lg text-gray-500 dark:text-gray-400">No media available</p>
              {primary ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">{primary}</p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Spacer for better scrolling */}
      <div className="h-4 bg-gray-50 dark:bg-gray-900"></div>
    </div>
  )
}
