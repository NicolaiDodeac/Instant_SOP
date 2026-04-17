'use client'

import type { RefObject } from 'react'
import { memo, useEffect, useRef, useState } from 'react'
import type { SOPStep, StepAnnotation } from '@/lib/types'
import StepPlayer from '@/components/StepPlayer'
import TextStepCanvas from '@/components/TextStepCanvas'

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
  /** Report intersection ratio (0–1) vs scroll root; parent picks the single active step. Stable ref recommended. */
  onStepIntersection?: (stepId: string, ratio: number) => void
  /**
   * When false, step may still have video_path/image_path but signed URLs are not ready yet.
   * Avoid showing "no media" during that window (defaults true for standalone use).
   */
  mediaSignedUrlsReady?: boolean
  /** Public viewer: snap-scrolling region — use as IntersectionObserver root (not the window). */
  intersectionRootRef?: RefObject<HTMLElement | null>
  /** Public viewer: fill snap page height instead of min-h-screen. */
  snapLayout?: boolean
}

function StepCard({
  step,
  annotations,
  videoUrl,
  imageUrl = null,
  posterUrl = null,
  stepNumber,
  totalSteps,
  playbackActive,
  onStepIntersection,
  mediaSignedUrlsReady = true,
  intersectionRootRef,
  snapLayout = false,
}: StepCardProps) {
  const primary = stepPrimaryText(step)
  const isTextStep = step.kind === 'text'
  const stepExpectsMedia = !!(step.video_path || step.image_path)
  const hasMediaUrl = !!(videoUrl || imageUrl)
  const [currentTime, setCurrentTime] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const onStepIntersectionRef = useRef(onStepIntersection)
  onStepIntersectionRef.current = onStepIntersection

  /** Lazy-mount heavy StepPlayer until near viewport (public long SOPs). First steps load eagerly. */
  const [mediaMounted, setMediaMounted] = useState(() => stepNumber <= 2)

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

    const root = intersectionRootRef?.current ?? null

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        const ratio = entry.isIntersecting ? entry.intersectionRatio : 0
        onStepIntersectionRef.current?.(step.id, ratio)
      },
      {
        threshold: Array.from({ length: 21 }, (_, i) => i / 20),
        root,
        rootMargin: '0px',
      }
    )

    observer.observe(card)

    return () => {
      observer.disconnect()
    }
  }, [step.id, videoUrl, imageUrl, stepNumber, intersectionRootRef])

  // Defer mounting StepPlayer until the card is near the scrollport (separate from ratio observer above).
  useEffect(() => {
    if (mediaMounted) return
    const card = cardRef.current
    if (!card) return
    const root = intersectionRootRef?.current ?? null
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setMediaMounted(true)
      },
      {
        root,
        rootMargin: '80% 0px 80% 0px',
        threshold: 0,
      }
    )
    observer.observe(card)
    return () => observer.disconnect()
  }, [mediaMounted, intersectionRootRef, videoUrl, imageUrl, stepNumber])

  return (
    <div
      ref={cardRef}
      className={`w-full flex flex-col bg-gray-50 dark:bg-gray-900 ${
        snapLayout ? 'min-h-full flex-1' : 'min-h-screen'
      }`}
    >
      {/* Step badge + description (same row as editor; number from position) */}
      <div className="border-b border-gray-200 bg-white py-3.5 dark:border-gray-700 dark:bg-gray-800">
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
      <div className="flex-1 bg-white pb-5 pt-3 dark:bg-gray-800">
        {isTextStep ? (
          <div className="w-full max-w-[min(100%,calc(100dvh*9/16))] mx-auto">
            <TextStepCanvas payload={step.text_payload ?? null} />
          </div>
        ) : hasMediaUrl ? (
          mediaMounted ? (
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
            <div
              className="relative flex w-full max-w-[min(100%,calc(100dvh*9/16))] mx-auto aspect-[9/16] max-h-[78dvh] min-h-[200px] md:max-h-[85vh] items-center justify-center rounded-lg overflow-hidden shadow-lg bg-black md:mx-auto"
              aria-hidden
            >
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            </div>
          )
        ) : stepExpectsMedia && !mediaSignedUrlsReady ? (
          <div
            className="relative flex w-full max-w-[min(100%,calc(100dvh*9/16))] mx-auto aspect-[9/16] max-h-[78dvh] min-h-[200px] items-center justify-center rounded-lg bg-gray-900 md:max-h-[85vh]"
            aria-busy="true"
            aria-label="Loading media"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
              <p className="text-sm text-gray-400">Loading media…</p>
            </div>
          </div>
        ) : stepExpectsMedia && mediaSignedUrlsReady ? (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700">
            <div className="text-center px-4">
              <p className="mb-2 text-lg text-gray-500 dark:text-gray-400">Media unavailable</p>
              {primary ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">{primary}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700">
            <div className="text-center px-4">
              <p className="mb-2 text-lg text-gray-500 dark:text-gray-400">No media for this step</p>
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

export default memo(StepCard)
