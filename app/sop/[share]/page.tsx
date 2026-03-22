'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseClient } from '@/lib/supabase/client'
import { getSharePageUrl } from '@/lib/public-site-url'
import type { SOP, SOPStep, StepAnnotation } from '@/lib/types'
import StepCard from '@/components/StepCard'
import { SopAuthorSignatureFetch } from '@/components/SopAuthorSignature'
import { fetchSignedMediaUrls } from '@/lib/fetch-signed-urls'

export default function PublicViewerPage() {
  const params = useParams()
  const shareSlug = params.share as string
  const router = useRouter()
  const supabase = useSupabaseClient()

  const [sop, setSop] = useState<SOP | null>(null)
  const [steps, setSteps] = useState<SOPStep[]>([])
  const [annotations, setAnnotations] = useState<Record<string, StepAnnotation[]>>({})
  const [videoUrls, setVideoUrls] = useState<Record<string, string | null>>({})
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({})
  const [posterUrls, setPosterUrls] = useState<Record<string, string | null>>({})
  /** False while batch presign runs; avoids showing "no media" before URLs exist. */
  const [mediaSignedUrlsReady, setMediaSignedUrlsReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [shareUrl, setShareUrl] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  /** Intersection ratio per step (0–1); only one video autoplays (highest ratio ≥ 75%). */
  const [stepIntersectRatio, setStepIntersectRatio] = useState<Record<string, number>>({})

  useEffect(() => {
    setShareUrl(getSharePageUrl(shareSlug))
  }, [shareSlug])

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) {
        router.replace('/auth/login')
        return
      }
      await loadSOP()
    })()
  }, [shareSlug])

  useEffect(() => {
    if (steps.length === 0) {
      setMediaSignedUrlsReady(true)
      return
    }
    setMediaSignedUrlsReady(false)
    let cancelled = false
    void loadAllVideos().then(() => {
      if (!cancelled) setMediaSignedUrlsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [steps])

  useEffect(() => {
    setStepIntersectRatio({})
  }, [steps])

  const activePlaybackStepId = useMemo(() => {
    let bestId: string | null = null
    let bestRatio = -1
    let bestIdx = Infinity
    for (const [id, r] of Object.entries(stepIntersectRatio)) {
      if (r < 0.75) continue
      const idx = steps.findIndex((s) => s.id === id)
      if (r > bestRatio || (r === bestRatio && idx < bestIdx)) {
        bestRatio = r
        bestId = id
        bestIdx = idx
      }
    }
    return bestId
  }, [stepIntersectRatio, steps])

  const handleStepIntersectionRatio = useCallback((stepId: string, ratio: number) => {
    setStepIntersectRatio((prev) => {
      const next = { ...prev }
      if (ratio < 0.75) {
        delete next[stepId]
      } else {
        next[stepId] = ratio
      }
      return next
    })
  }, [])

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
    const pathSet = new Set<string>()
    for (const step of steps) {
      if (step.video_path) pathSet.add(step.video_path)
      if (step.image_path) pathSet.add(step.image_path)
      if (step.thumbnail_path) pathSet.add(step.thumbnail_path)
    }
    const uniquePaths = [...pathSet]

    const urlByPath =
      uniquePaths.length > 0 ? await fetchSignedMediaUrls(uniquePaths) : {}

    const vUrls: Record<string, string | null> = {}
    const iUrls: Record<string, string | null> = {}
    const pUrls: Record<string, string | null> = {}

    for (const step of steps) {
      vUrls[step.id] = step.video_path ? (urlByPath[step.video_path] ?? null) : null
      iUrls[step.id] = step.image_path ? (urlByPath[step.image_path] ?? null) : null
      pUrls[step.id] = step.thumbnail_path ? (urlByPath[step.thumbnail_path] ?? null) : null
    }

    setVideoUrls(vUrls)
    setImageUrls(iUrls)
    setPosterUrls(pUrls)
  }

  async function copyShareLink() {
    const url = shareUrl || getSharePageUrl(shareSlug)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        return
      }
    }
    setLinkCopied(true)
    window.setTimeout(() => setLinkCopied(false), 2000)
  }

  async function downloadQrPng() {
    const url = shareUrl || getSharePageUrl(shareSlug)
    try {
      const res = await fetch(`/api/qr?url=${encodeURIComponent(url)}`)
      if (!res.ok) return
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${shareSlug}-qr.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (e) {
      console.error('QR download failed:', e)
    }
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
    <div className="min-h-screen min-h-[100dvh] safe-top safe-left safe-right bg-gray-50 dark:bg-gray-900">
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
            // Pass both; StepPlayer prefers image when imageUrl is present.
            videoUrl={videoUrls[step.id] || null}
            imageUrl={imageUrls[step.id] || null}
            posterUrl={posterUrls[step.id] || null}
            stepNumber={idx + 1}
            totalSteps={steps.length}
            playbackActive={activePlaybackStepId === step.id}
            onIntersectionRatio={(ratio) => handleStepIntersectionRatio(step.id, ratio)}
            mediaSignedUrlsReady={mediaSignedUrlsReady}
          />
        ))}
      </div>

      {/* Share link + QR (view mode only) */}
      <div className="px-4 pt-4 pb-1 border-t border-gray-200 dark:border-gray-800 safe-left safe-right max-w-lg mx-auto w-full">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Share this SOP
        </h2>
        <button
          type="button"
          onClick={() => void copyShareLink()}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-left text-sm break-all hover:bg-gray-50 dark:hover:bg-gray-700/80 transition-colors min-h-[48px]"
        >
          {linkCopied ? (
            <span className="text-green-600 dark:text-green-400 font-medium">Copied!</span>
          ) : (
            <span className="text-blue-600 dark:text-blue-400">
              {shareUrl || `…/sop/${shareSlug}`}
            </span>
          )}
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
          Tap to copy link to clipboard
        </p>
        {shareUrl ? (
          <button
            type="button"
            onClick={() => void downloadQrPng()}
            className="mt-4 w-full flex flex-col items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-3 px-2 hover:bg-gray-50 dark:hover:bg-gray-700/80 transition-colors min-h-[48px]"
            aria-label="Download QR code as PNG"
          >
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Tap QR to download image
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic API URL */}
            <img
              src={`/api/qr?url=${encodeURIComponent(shareUrl)}`}
              alt=""
              width={192}
              height={192}
              className="w-48 h-48 object-contain"
            />
          </button>
        ) : null}
      </div>

      <footer className="pt-2 border-t border-gray-200 dark:border-gray-800 w-full flex justify-center items-center pb-0">
        <SopAuthorSignatureFetch sopId={sop.id} />
      </footer>
    </div>
  )
}
