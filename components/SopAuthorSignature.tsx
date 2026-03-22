'use client'

import { useEffect, useMemo, useState } from 'react'

export type SopAuthorInfo = {
  displayName: string
  email: string | null
  avatarUrl: string | null
}

function initialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  }
  if (parts.length === 1 && parts[0]!.length >= 2) {
    return parts[0]!.slice(0, 2).toUpperCase()
  }
  return label.slice(0, 1).toUpperCase() || '?'
}

export function SopAuthorAvatar({
  author,
  size = 24,
  className = '',
}: {
  author: SopAuthorInfo
  size?: number
  className?: string
}) {
  const label = author.displayName || author.email || 'Creator'
  const initials = useMemo(() => initialsFromLabel(label), [label])

  if (author.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Google / OAuth avatar URL
      <img
        src={author.avatarUrl}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className={`rounded-full object-cover shrink-0 bg-gray-200 dark:bg-gray-600 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      aria-hidden
    >
      {initials}
    </div>
  )
}

/** Loads owner name/email for a single SOP (authenticated API). Text-only — no avatar (used in SOP viewer). */
export function SopAuthorSignatureFetch({ sopId }: { sopId: string }) {
  const [author, setAuthor] = useState<SopAuthorInfo | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(`/api/sop-author?sopId=${encodeURIComponent(sopId)}`)
      if (!res.ok) {
        if (!cancelled) setAuthor(null)
        return
      }
      const data = (await res.json()) as SopAuthorInfo
      if (!cancelled) setAuthor(data)
    })()
    return () => {
      cancelled = true
    }
  }, [sopId])

  if (author === undefined || author === null) return null
  return (
    <SopAuthorByline
      author={author}
      className="text-[11px] sm:text-xs text-center"
    />
  )
}

/** Text-only “By …” for compact layouts (e.g. dashboard list next to date). */
export function SopAuthorByline({
  author,
  className = '',
  twoRows = false,
  nameOnly = false,
}: {
  author: SopAuthorInfo
  className?: string
  /** Name on first row, email on second (dashboard list). */
  twoRows?: boolean
  /** List cards: “By …” with label only (no email). Inside SOP uses full line with email when set. */
  nameOnly?: boolean
}) {
  const primary = author.displayName || author.email || 'Creator'
  const showEmail =
    author.email &&
    author.displayName &&
    author.email.toLowerCase() !== primary.toLowerCase() &&
    !primary.includes('@')

  if (nameOnly) {
    return (
      <span className={`text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 ${className}`}>
        <span className="text-gray-400 dark:text-gray-500">By </span>
        <span className="text-gray-600 dark:text-gray-300 truncate">{primary}</span>
      </span>
    )
  }

  if (twoRows && showEmail) {
    return (
      <div className={`text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 ${className}`}>
        <div className="text-right leading-snug">
          <span className="text-gray-400 dark:text-gray-500">By </span>
          <span className="text-gray-600 dark:text-gray-300">{primary}</span>
        </div>
        <div className="text-right leading-snug mt-0.5 text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[14rem] sm:max-w-[18rem]">
          {author.email}
        </div>
      </div>
    )
  }

  return (
    <span className={`text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 ${className}`}>
      <span className="text-gray-400 dark:text-gray-500">By </span>
      <span className="text-gray-600 dark:text-gray-300">{primary}</span>
      {showEmail ? (
        <span className="opacity-80">
          {' '}
          · {author.email}
        </span>
      ) : null}
    </span>
  )
}
