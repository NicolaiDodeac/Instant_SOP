'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { getSharePageUrl } from '@/lib/public-site-url'
import type { SOP, SOPStep, SopAuthorMeta, StepAnnotation } from '@/lib/types'
import StepCard from '@/components/StepCard'
import { SopCreatedUpdatedFooter } from '@/components/SopAuthorSignature'

const EMPTY_ANNOTATIONS: StepAnnotation[] = []

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
  const stepsScrollRef = useRef<HTMLDivElement>(null)
  const sopTitleRef = useRef<HTMLHeadingElement>(null)
  const [shareUrl, setShareUrl] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [stepIntersectRatio, setStepIntersectRatio] = useState<Record<string, number>>({})
  const [sopTitleExpanded, setSopTitleExpanded] = useState(false)
  const [sopTitleOverflows, setSopTitleOverflows] = useState(false)

  useEffect(() => {
    setShareUrl(getSharePageUrl(shareSlug))
  }, [shareSlug])

  useEffect(() => {
    setStepIntersectRatio({})
  }, [steps])

  const sopTitleFullText = useMemo(() => {
    const n = sop.sop_number != null ? `SOP ${sop.sop_number} — ` : ''
    return `${n}${sop.title ?? ''}`
  }, [sop.sop_number, sop.title])

  useEffect(() => {
    setSopTitleExpanded(false)
  }, [sopTitleFullText])

  const measureSopTitleOverflow = useCallback(() => {
    const el = sopTitleRef.current
    if (!el) {
      setSopTitleOverflows(false)
      return
    }
    if (sopTitleExpanded) return
    setSopTitleOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [sopTitleExpanded])

  useLayoutEffect(() => {
    measureSopTitleOverflow()
  }, [measureSopTitleOverflow, sopTitleFullText, sopTitleExpanded])

  useEffect(() => {
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            measureSopTitleOverflow()
          })
        : null
    const el = sopTitleRef.current
    if (el && ro) ro.observe(el)
    return () => {
      if (el && ro) ro.unobserve(el)
      ro?.disconnect()
    }
  }, [measureSopTitleOverflow, sopTitleFullText])

  useLayoutEffect(() => {
    const el = stepsScrollRef.current
    if (!el) return

    const collapseTitle = () => {
      setSopTitleExpanded(false)
    }

    el.addEventListener('scroll', collapseTitle, { passive: true })
    return () => el.removeEventListener('scroll', collapseTitle)
  }, [steps.length])

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
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden safe-top safe-bottom safe-left safe-right bg-gray-50 dark:bg-gray-900">
      <header className="z-20 shrink-0 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-baseline gap-3 px-3 py-2">
          <button
            type="button"
            onClick={handleBack}
            className="touch-target -ml-2 shrink-0 border-0 bg-transparent pl-2 pr-2 text-left text-sm font-medium leading-snug text-blue-600 dark:text-blue-400 cursor-pointer"
            aria-label="Go back"
          >
            ← Back
          </button>
          <div className="min-w-0 flex-1">
            <h1
              ref={sopTitleRef}
              id="sop-public-title"
              className={`text-xl font-bold leading-snug text-gray-900 dark:text-gray-100 break-words text-left ${
                !sopTitleExpanded ? 'line-clamp-2' : ''
              }`}
            >
              {sopTitleFullText}
            </h1>
            {sopTitleOverflows ? (
              <button
                type="button"
                className="mt-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                aria-expanded={sopTitleExpanded}
                aria-controls="sop-public-title"
                onClick={() => setSopTitleExpanded((v) => !v)}
              >
                {sopTitleExpanded ? 'Show less' : 'Show more'}
              </button>
            ) : null}
          </div>
        </div>
        {sop.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 px-3 pb-3 mt-0 text-left leading-snug">
            {sop.description}
          </p>
        )}
      </header>

      <div
        ref={stepsScrollRef}
        className="min-h-0 flex-1 w-full overflow-y-auto overflow-x-hidden overscroll-y-contain snap-y snap-mandatory scroll-smooth motion-reduce:scroll-auto scroll-pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {steps.map((step, idx) => (
          <section
            key={step.id}
            className="snap-center snap-always flex min-h-full w-full shrink-0 flex-col"
            aria-label={`Step ${idx + 1} of ${steps.length}`}
          >
            <StepCard
              step={step}
              annotations={annotations[step.id] ?? EMPTY_ANNOTATIONS}
              videoUrl={videoUrls[step.id] ?? null}
              imageUrl={imageUrls[step.id] ?? null}
              posterUrl={posterUrls[step.id] ?? null}
              stepNumber={idx + 1}
              totalSteps={steps.length}
              playbackActive={activePlaybackStepId === step.id}
              onStepIntersection={handleStepIntersectionRatio}
              mediaSignedUrlsReady
              intersectionRootRef={stepsScrollRef}
              snapLayout
            />
          </section>
        ))}

        {/* Own snap page so snap-mandatory does not trap scroll on the last step (hiding QR / link). */}
        <section
          className="snap-center snap-always flex min-h-full w-full shrink-0 flex-col"
          aria-label="Share link and QR code"
        >
          <div className="mt-auto w-full max-w-lg mx-auto border-t border-gray-200 dark:border-gray-800 px-3 pt-5 pb-2">
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
                <Image
                  src={`/api/qr?url=${encodeURIComponent(shareUrl)}`}
                  alt=""
                  width={192}
                  height={192}
                  className="w-48 h-48 object-contain"
                  unoptimized
                />
              </button>
            ) : null}

            <footer className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-800 w-full flex justify-center items-center pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <SopCreatedUpdatedFooter sopId={sop.id} initialMeta={authorMeta} />
            </footer>
          </div>
        </section>
      </div>
    </div>
  )
}
