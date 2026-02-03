'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSupabaseClient } from '@/lib/supabase/client'
import type { SOP, SOPStep, StepAnnotation } from '@/lib/types'
import StepCard from '@/components/StepCard'

export default function PublicViewerPage() {
  const params = useParams()
  const shareSlug = params.share as string
  const supabase = useSupabaseClient()

  const [sop, setSop] = useState<SOP | null>(null)
  const [steps, setSteps] = useState<SOPStep[]>([])
  const [annotations, setAnnotations] = useState<Record<string, StepAnnotation[]>>({})
  const [videoUrls, setVideoUrls] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSOP()
  }, [shareSlug])

  useEffect(() => {
    if (steps.length > 0) {
      loadAllVideos()
    }
  }, [steps])

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
        const stepIds = stepsData.map((s: SOPStep) => s.id)
        const { data: annsData } = await supabase
          .from('step_annotations')
          .select('*')
          .in('step_id', stepIds)

        if (annsData) {
          const annsMap: Record<string, StepAnnotation[]> = {}
          annsData.forEach((ann: any) => {
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

  async function loadAllVideos() {
    const urls: Record<string, string | null> = {}
    
    for (const step of steps) {
      if (!step.video_path) {
        urls[step.id] = null
        continue
      }

      try {
        const res = await fetch(
          `/api/videos/signed-url?path=${encodeURIComponent(step.video_path)}`
        )
        if (res.ok) {
          const { url } = await res.json()
          urls[step.id] = url
        } else {
          urls[step.id] = null
        }
      } catch (err) {
        console.error('Error loading video for step:', step.id, err)
        urls[step.id] = null
      }
    }
    
    setVideoUrls(urls)
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
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 safe-top">
        <div className="p-4">
          <h1 className="text-xl font-bold text-center">{sop.title}</h1>
          {sop.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-1">
              {sop.description}
            </p>
          )}
        </div>
      </div>

      {/* Scrollable feed of steps */}
      <div className="scroll-smooth">
        {steps.map((step, idx) => (
          <StepCard
            key={step.id}
            step={step}
            annotations={annotations[step.id] || []}
            videoUrl={videoUrls[step.id] || null}
            stepNumber={idx + 1}
            totalSteps={steps.length}
          />
        ))}
      </div>

      {/* Install prompt */}
      <div className="p-4 text-center text-sm text-gray-600 dark:text-gray-400">
        <p>Add to Home Screen for offline access</p>
      </div>
    </div>
  )
}
