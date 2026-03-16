'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
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
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({})
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
    const vUrls: Record<string, string | null> = {}
    const iUrls: Record<string, string | null> = {}

    for (const step of steps) {
      if (step.video_path) {
        try {
          const res = await fetch(
            `/api/videos/signed-url?path=${encodeURIComponent(step.video_path)}`
          )
          if (res.ok) {
            const { url } = await res.json()
            vUrls[step.id] = url
          } else {
            vUrls[step.id] = null
          }
        } catch (err) {
          console.error('Error loading video for step:', step.id, err)
          vUrls[step.id] = null
        }
      } else {
        vUrls[step.id] = null
      }

      if (step.image_path) {
        try {
          const res = await fetch(
            `/api/videos/signed-url?path=${encodeURIComponent(step.image_path)}`
          )
          if (res.ok) {
            const { url } = await res.json()
            iUrls[step.id] = url
          } else {
            iUrls[step.id] = null
          }
        } catch (err) {
          console.error('Error loading image for step:', step.id, err)
          iUrls[step.id] = null
        }
      } else {
        iUrls[step.id] = null
      }
    }

    setVideoUrls(vUrls)
    setImageUrls(iUrls)
  }


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center safe-top safe-bottom bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!sop || steps.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center safe-top safe-bottom p-4 bg-gray-50 dark:bg-gray-900">
        <p className="text-center text-gray-600 dark:text-gray-400">
          This SOP doesn&apos;t exist or has no steps.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] safe-top safe-bottom safe-left safe-right bg-gray-50 dark:bg-gray-900">
      {/* Header with back arrow */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 safe-top">
        <div className="flex gap-2 px-2 py-2 min-h-[44px]">
          <Link
            href="/dashboard"
            className="text-blue-600 dark:text-blue-400 touch-target px-2 py-1.5 min-w-[44px] text-sm font-medium shrink-0"
            aria-label="Back to dashboard"
          >
            ← Back
          </Link>
          <h1 className="flex-1 text-xl font-bold text-center truncate pr-10">
            {sop.title}
          </h1>
        </div>
        {sop.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center px-4 pb-3 mt-0">
            {sop.description}
          </p>
        )}
      </div>

      {/* Scrollable feed of steps */}
      <div className="scroll-smooth">
        {steps.map((step, idx) => (
          <StepCard
            key={step.id}
            step={step}
            annotations={annotations[step.id] || []}
            videoUrl={step.image_path ? null : (videoUrls[step.id] || null)}
            imageUrl={step.video_path ? null : (imageUrls[step.id] || null)}
            stepNumber={idx + 1}
            totalSteps={steps.length}
          />
        ))}
      </div>

      {/* Install prompt (Android: Add to Home screen / Install app) */}
      <div className="p-4 pb-8 text-center text-sm text-gray-600 dark:text-gray-400 safe-bottom">
        <p>Add to Home Screen for offline access</p>
      </div>
    </div>
  )
}
