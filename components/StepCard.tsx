'use client'

import { useEffect, useRef, useState } from 'react'
import type { SOPStep, StepAnnotation } from '@/lib/types'
import StepPlayer from '@/components/StepPlayer'

interface StepCardProps {
  step: SOPStep
  annotations: StepAnnotation[]
  videoUrl: string | null
  stepNumber: number
  totalSteps: number
}

export default function StepCard({
  step,
  annotations,
  videoUrl,
  stepNumber,
  totalSteps,
}: StepCardProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)

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

  // Intersection Observer to detect when card enters viewport
  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Consider visible if at least 30% of the card is in viewport (more lenient for smoother transitions)
          const isIntersecting = entry.isIntersecting && entry.intersectionRatio >= 0.3
          setIsVisible(isIntersecting)
        })
      },
      {
        threshold: [0, 0.3, 0.5, 0.7, 1.0], // More granular thresholds for smoother transitions
        rootMargin: '-10% 0px -10% 0px', // Less aggressive margin for earlier triggering
      }
    )

    observer.observe(card)

    return () => {
      observer.disconnect()
    }
  }, [videoUrl, stepNumber])

  return (
    <div
      ref={cardRef}
      className="w-full min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900"
    >
      {/* Step Header with Number */}
      <div className="bg-white dark:bg-gray-800 px-4 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          {/* Blue square with step number */}
          <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <span className="text-white font-semibold text-sm">{stepNumber}</span>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {step.title}
            </h2>
          </div>
        </div>
      </div>

      {/* Instruction Text */}
      {step.instructions && (
        <div className="bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <p className="text-base text-gray-700 dark:text-gray-300">
            {step.instructions}
          </p>
        </div>
      )}

      {/* Video Player - Full Width with Rounded Corners */}
      <div className="flex-1 bg-white dark:bg-gray-800 px-4 py-4">
        {videoUrl ? (
          <div className="w-full rounded-lg overflow-hidden shadow-lg bg-black">
            <StepPlayer
              videoUrl={videoUrl}
              annotations={annotations}
              currentTime={currentTime}
              startTime={startTime}
              endTime={endTime}
              onAnnotationUpdate={() => {}}
              onAnnotationDelete={() => {}}
              selectedAnnotationId={null}
              onSelectAnnotation={() => {}}
              onTimeUpdate={setCurrentTime}
              showControls={true} // Show native HTML5 video controls in public viewer
              autoPlay={isVisible && !!videoUrl} // Auto-play when visible and video is loaded
              filterAnnotationsByTime={true} // Filter annotations by time in public viewer
            />
          </div>
        ) : (
          <div className="w-full aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-gray-500 dark:text-gray-400 mb-2">No video available</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">{step.title}</p>
            </div>
          </div>
        )}
      </div>

      {/* Spacer for better scrolling */}
      <div className="h-4 bg-gray-50 dark:bg-gray-900"></div>
    </div>
  )
}
