'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'instant-sop-pwa-install-snooze-until'

/** Snooze duration after "Not now" (ms) */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

function isStandalone(): boolean {
  if (typeof window === 'undefined') return true
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true
  // iPadOS 13+ can report as desktop Safari
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Registers `/sw.js` and shows install hints: native prompt on Chromium when available,
 * iOS instructions otherwise, generic browser menu fallback.
 */
export function PwaInstallCard() {
  const [mounted, setMounted] = useState(false)
  const [hidden, setHidden] = useState(true)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    setMounted(true)
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const until = parseInt(raw, 10)
        if (!Number.isNaN(until) && Date.now() < until) {
          return
        }
      }
    } catch {
      /* ignore */
    }
    if (isStandalone()) return
    setHidden(false)
  }, [])

  useEffect(() => {
    if (!mounted || hidden) return
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [mounted, hidden])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + SNOOZE_MS))
    } catch {
      /* ignore */
    }
    setHidden(true)
  }, [])

  const onInstallClick = useCallback(async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } catch {
      /* ignore */
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  if (!mounted || hidden || isStandalone()) return null

  const ios = isIos()
  const showInstallButton = deferredPrompt !== null

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 p-4 text-left shadow-sm">
      <div className="flex gap-3">
        <div
          className="shrink-0 flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40 text-2xl"
          aria-hidden
        >
          📲
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Install app on your home screen
          </h3>
          {showInstallButton ? (
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Quick access like a native app. Works best after you&apos;ve used the site once or twice.
            </p>
          ) : ios ? (
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Tap <span className="font-medium text-gray-800 dark:text-gray-200">Share</span>, then{' '}
              <span className="font-medium text-gray-800 dark:text-gray-200">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              In Chrome: open the menu <span className="font-medium">⋮</span> and choose{' '}
              <span className="font-medium">Install app</span> or{' '}
              <span className="font-medium">Add to Home screen</span>. Other browsers may differ.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {showInstallButton && (
              <button
                type="button"
                onClick={() => void onInstallClick()}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white touch-target min-h-[44px]"
              >
                Install
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 touch-target min-h-[44px]"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
