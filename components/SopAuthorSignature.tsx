'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { formatSopDateTime } from '@/lib/format-date'
import type { SopAuthorInfo, SopAuthorMeta } from '@/lib/types'

export type { SopAuthorInfo, SopAuthorMeta } from '@/lib/types'

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
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setImgFailed(false)
  }, [author.avatarUrl])

  const showImg = Boolean(author.avatarUrl) && !imgFailed

  if (showImg) {
    return (
      <Image
        src={author.avatarUrl!}
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
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


/** Created by + updated (with last editor when different from owner). Authenticated API. */
export function SopCreatedUpdatedFooter({
  sopId,
  initialMeta,
  className = '',
}: {
  sopId: string
  /** When provided (e.g. from RSC), skips client fetch. */
  initialMeta?: SopAuthorMeta | null
  className?: string
}) {
  const [meta, setMeta] = useState<SopAuthorMeta | null | undefined>(() =>
    initialMeta !== undefined ? initialMeta : undefined
  )

  useEffect(() => {
    if (initialMeta !== undefined) return
    let cancelled = false
    void (async () => {
      const res = await fetch(`/api/sop-author?sopId=${encodeURIComponent(sopId)}`)
      if (!res.ok) {
        if (!cancelled) setMeta(null)
        return
      }
      const data = (await res.json()) as SopAuthorMeta
      if (!cancelled) setMeta(data)
    })()
    return () => {
      cancelled = true
    }
  }, [sopId, initialMeta])

  if (meta === undefined) {
    return (
      <div className={`text-[11px] text-gray-400 dark:text-gray-500 py-2 ${className}`}>Loading…</div>
    )
  }
  if (meta === null) return null

  const { creator, lastEditor, updated_at } = meta
  const updatedLabel = formatSopDateTime(updated_at)
  const creatorName = creator.displayName || creator.email || 'Creator'

  return (
    <div
      className={`text-[11px] sm:text-xs text-gray-600 dark:text-gray-400 text-center max-w-md mx-auto px-2 py-3 space-y-3 ${className}`}
    >
      <div>
        <div className="text-gray-500 dark:text-gray-500 font-medium">Created by</div>
        <div className="text-gray-800 dark:text-gray-200 font-medium">{creatorName}</div>
        {creator.email ? (
          <div className="text-gray-500 dark:text-gray-400 break-all mt-0.5">{creator.email}</div>
        ) : null}
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        {lastEditor ? (
          <div className="space-y-1">
            <div>
              <span className="text-gray-500 dark:text-gray-500">Updated </span>
              <span className="text-gray-700 dark:text-gray-300">{updatedLabel}</span>
            </div>
            <div className="text-gray-500 dark:text-gray-500">
              by {lastEditor.displayName || lastEditor.email}
            </div>
            {lastEditor.email ? (
              <div className="text-gray-500 dark:text-gray-400 break-all">{lastEditor.email}</div>
            ) : null}
          </div>
        ) : (
          <div>
            <span className="text-gray-500 dark:text-gray-500">Updated </span>
            <span className="text-gray-700 dark:text-gray-300">{updatedLabel}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** @deprecated Alias for {@link SopCreatedUpdatedFooter} */
export function SopAuthorSignatureFetch({ sopId }: { sopId: string }) {
  return <SopCreatedUpdatedFooter sopId={sopId} />
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

  if (twoRows && author.email) {
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
