'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { SOP, SOPStep, StepAnnotation } from '@/lib/types'

// Dynamically import StepPlayer to avoid SSR and React instance issues with react-konva
const StepPlayer = dynamic(() => import('@/components/StepPlayer'), {
  ssr: false,
})

export default function PublicViewerPage() {
  const params = useParams()
  const shareSlug = params.share as string
  const supabase = createClient()

  const [sop, setSop] = useState<SOP | null>(null)
  const [steps, setSteps] = useState<SOPStep[]>([])
  const [annotations, setAnnotations] = useState<Record<string, StepAnnotation[]>>({})
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSOP()
  }, [shareSlug])

  useEffect(() => {
    if (steps.length > 0 && currentStepIdx < steps.length) {
      loadStepVideo(steps[currentStepIdx])
    }
  }, [steps, currentStepIdx])

  async function loadSOP() {
    try {
      const { data: sopData, error } = await supabase
        .from('sops')
        .select('*')
        .eq('share_slug', shareSlug)
        .eq('published', true)
        .single()

      if (error || !sopData) {
        setLoading(false)
        return
      }

      setSop(sopData as SOP)

      // Load steps
      const { data: stepsData } = await supabase
        .from('sop_steps')
        .select('*')
        .eq('sop_id', sopData.id)
        .order('idx', { ascending: true })

      if (stepsData) {
        setSteps(stepsData as SOPStep[])
      }

      // Load annotations
      if (stepsData && stepsData.length > 0) {
        const stepIds = stepsData.map((s) => s.id)
        const { data: annsData } = await supabase
          .from('step_annotations')
          .select('*')
          .in('step_id', stepIds)

        if (annsData) {
          const annsMap: Record<string, StepAnnotation[]> = {}
          annsData.forEach((ann) => {
            if (!annsMap[ann.step_id]) {
              annsMap[ann.step_id] = []
            }
            annsMap[ann.step_id].push(ann as StepAnnotation)
          })
          setAnnotations(annsMap)
        }
      }
    } catch (err) {
      console.error('Error loading SOP:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadStepVideo(step: SOPStep) {
    if (!step.video_path) {
      setVideoUrl(null)
      return
    }

    try {
      const res = await fetch(
        `/api/videos/signed-url?path=${encodeURIComponent(step.video_path)}`
      )
      if (res.ok) {
        const { url } = await res.json()
        setVideoUrl(url)

        // Set time range from first annotation
        const stepAnns = annotations[step.id] || []
        if (stepAnns.length > 0) {
          const firstAnn = stepAnns[0]
          setStartTime(firstAnn.t_start_ms)
          setEndTime(firstAnn.t_end_ms)
        } else {
          setStartTime(0)
          setEndTime(step.duration_ms || 0)
        }
      }
    } catch (err) {
      console.error('Error loading video:', err)
    }
  }

  const currentStep = steps[currentStepIdx]
  const currentAnnotations = currentStep
    ? annotations[currentStep.id] || []
    : []

  const handleNextStep = () => {
    if (currentStepIdx < steps.length - 1) {
      setCurrentStepIdx(currentStepIdx + 1)
      setCurrentTime(0)
    }
  }

  const handlePrevStep = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx(currentStepIdx - 1)
      setCurrentTime(0)
    }
  }


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    )
  }

  if (!sop || steps.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>SOP not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen safe-top safe-bottom safe-left safe-right bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 safe-top">
        <div className="p-4">
          <h1 className="text-xl font-bold text-center">{sop.title}</h1>
          {sop.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">
              {sop.description}
            </p>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="p-4 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Step {currentStepIdx + 1} of {steps.length}
        </p>
        <h2 className="text-lg font-semibold mt-1">
          {currentStep?.title}
        </h2>
      </div>

      {/* Video player */}
      {currentStep && (
        <div className="p-4 space-y-4">
          {videoUrl ? (
            <StepPlayer
              videoUrl={videoUrl}
              annotations={currentAnnotations}
              currentTime={currentTime}
              startTime={startTime}
              endTime={endTime}
              onAnnotationUpdate={() => {}}
              onAnnotationDelete={() => {}}
              selectedAnnotationId={null}
              onSelectAnnotation={() => {}}
              onTimeUpdate={setCurrentTime}
              showControls={true}
            />
          ) : (
            <div className="w-full aspect-video bg-black rounded-lg flex items-center justify-center text-gray-400">
              No video available
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-4">
            <button
              onClick={handlePrevStep}
              disabled={currentStepIdx === 0}
              className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 text-white font-semibold py-4 px-4 rounded-lg touch-target"
            >
              ← Previous
            </button>
            <button
              onClick={handleNextStep}
              disabled={currentStepIdx === steps.length - 1}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-4 px-4 rounded-lg touch-target"
            >
              Next Step →
            </button>
          </div>
        </div>
      )}

      {/* Install prompt */}
      <div className="p-4 text-center text-sm text-gray-600 dark:text-gray-400">
        <p>Add to Home Screen for offline access</p>
      </div>
    </div>
  )
}
