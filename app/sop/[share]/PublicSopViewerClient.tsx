'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSharePageUrl } from '@/lib/public-site-url'
import type { SOP, SOPStep, SopAuthorMeta, StepAnnotation } from '@/lib/types'
import StepCard from '@/components/StepCard'
import { SopCreatedUpdatedFooter } from '@/components/SopAuthorSignature'

export default function PublicSopViewerClient({
  shareSlug,
  isLoggedIn,
  returnTo,
  sop,
  steps,
  annotations,
  videoUrls,
  imageUrls,
  posterUrls,
  authorMeta,
}: {
  shareSlug: string
  isLoggedIn: boolean
  /** When set (from `?returnTo=` or server default for owner/editor), Back navigates here. */
  returnTo: string | null
  sop: SOP
  steps: SOPStep[]
  annotations: Record<string, StepAnnotation[]>
  videoUrls: Record<string, string | null>
  imageUrls: Record<string, string | null>
  posterUrls: Record<string, string | null>
  authorMeta: SopAuthorMeta | null
}) {
  const router = useRouter()
  const [shareUrl, setShareUrl] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [stepIntersectRatio, setStepIntersectRatio] = useState<Record<string, number>>({})

  useEffect(() => {
    setShareUrl(getSharePageUrl(shareSlug))
  }, [shareSlug])

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

  const handleBack = useCallback(() => {
    if (returnTo) {
      router.push(returnTo)
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(isLoggedIn ? '/dashboard' : '/auth/login')
  }, [returnTo, router, isLoggedIn])

  if (steps.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center safe-top safe-bottom bg-gray-50 dark:bg-gray-900 py-8">
        <p className="text-center text-gray-600 dark:text-gray-400">
          This SOP doesn&apos;t exist or has no steps.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] safe-top safe-bottom safe-left safe-right bg-gray-50 dark:bg-gray-900">
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 safe-top">
        <div className="flex gap-2 py-2 min-h-[44px]">
          <button
            type="button"
            onClick={handleBack}
            className="text-blue-600 dark:text-blue-400 touch-target px-2 py-1.5 min-w-[44px] text-sm font-medium shrink-0 text-left bg-transparent border-0 cursor-pointer"
            aria-label="Go back"
          >
            ← Back
          </button>
          <h1 className="flex-1 text-xl font-bold text-center truncate pr-10">
            {sop.sop_number != null ? `SOP ${sop.sop_number} — ` : ''}
            {sop.title}
          </h1>
        </div>
        {sop.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center pb-3 mt-0">
            {sop.description}
          </p>
        )}
      </div>

      <div className="scroll-smooth pb-3">
        {steps.map((step, idx) => (
          <StepCard
            key={step.id}
            step={step}
            annotations={annotations[step.id] || []}
            videoUrl={videoUrls[step.id] || null}
            imageUrl={imageUrls[step.id] || null}
            posterUrl={posterUrls[step.id] || null}
            stepNumber={idx + 1}
            totalSteps={steps.length}
            playbackActive={activePlaybackStepId === step.id}
            onIntersectionRatio={(ratio) => handleStepIntersectionRatio(step.id, ratio)}
            mediaSignedUrlsReady
          />
        ))}
      </div>

      <div className="pt-5 pb-2 border-t border-gray-200 dark:border-gray-800 max-w-lg mx-auto w-full">
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
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">Tap to copy link to clipboard</p>
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
        <SopCreatedUpdatedFooter sopId={sop.id} initialMeta={authorMeta} />
      </footer>
    </div>
  )
}
