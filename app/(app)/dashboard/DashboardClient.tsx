'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseClient } from '@/lib/supabase/client'
import { formatSopListDate } from '@/lib/format-date'
import type { SopAuthorMeta, SOP } from '@/lib/types'
import { PwaInstallCard } from '@/components/PwaInstallCard'
import {
  SopAuthorAvatar,
  SopAuthorByline,
} from '@/components/SopAuthorSignature'

export default function DashboardClient() {
  const [sops, setSops] = useState<SOP[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditor, setIsEditor] = useState<boolean | null>(null)
  const [isSuperUser, setIsSuperUser] = useState(false)
  const [sopMeta, setSopMeta] = useState<Record<string, SopAuthorMeta>>({})
  const [search, setSearch] = useState('')
  const router = useRouter()
  const supabase = useSupabaseClient()

  const publishedSopIds = useMemo(
    () => sops.filter((s) => s.published && s.share_slug).map((s) => s.id),
    [sops]
  )

  useEffect(() => {
    loadSOPs()
    loadMe()
  }, [])

  useEffect(() => {
    if (publishedSopIds.length === 0) {
      setSopMeta({})
      return
    }
    let cancelled = false
    const ids = publishedSopIds.join(',')
    void (async () => {
      try {
        const res = await fetch(`/api/sop-author?sopIds=${encodeURIComponent(ids)}`)
        if (!res.ok) return
        const data = (await res.json()) as { authors?: Record<string, SopAuthorMeta> }
        if (!cancelled) setSopMeta(data.authors ?? {})
      } catch {
        if (!cancelled) setSopMeta({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [publishedSopIds])

  async function loadMe() {
    try {
      const res = await fetch('/api/user/me')
      const data = await res.json()
      setIsEditor(data?.isEditor === true)
      setIsSuperUser(data?.isSuperUser === true)
    } catch {
      setIsEditor(false)
      setIsSuperUser(false)
    }
  }

  async function loadSOPs() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('sops')
      .select('*')
      .order('updated_at', { ascending: false, nullsFirst: false })

    if (!error && data) {
      setSops(data as SOP[])
    }
    setLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen min-h-[100dvh] safe-top safe-left safe-right pb-20 md:pb-4 safe-bottom">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 safe-top">
        <div className="flex items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-2.5">
          <h1 className="text-xl md:text-2xl font-bold truncate">SOPs</h1>
          <div className="flex items-center gap-1 shrink-0">
            {isSuperUser && (
              <Link
                href="/admin/editors"
                className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 touch-target px-2 min-h-[2.25rem]"
              >
                Manage editors
              </Link>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 touch-target px-2 min-h-[2.25rem]"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <PwaInstallCard />

        {isEditor && (
          <Link
            href="/editor"
            className="block px-3 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg touch-target"
          >
            <span className="font-semibold text-blue-700 dark:text-blue-300">
              Create / Edit SOPs
            </span>
            <p className="text-sm text-blue-600/80 dark:text-blue-400/80 mt-0.5">
              New SOP, drafts, and edit existing
            </p>
          </Link>
        )}

        <Link
          href="/ops"
          className="block px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg touch-target"
        >
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            Line specific search
          </span>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Line → leg → machine → section / station code
          </p>
        </Link>

        <div id="sop-list">
          <h2 className="text-lg font-semibold mb-2">SOPs</h2>
          <div className="mb-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SOP title or number… (e.g. 1207)"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-white touch-target text-base"
              aria-label="Search SOPs"
              inputMode="search"
            />
          </div>
          {loading || isEditor === null ? (
            <div className="text-center py-8">Loading...</div>
          ) : (() => {
            const q = search.trim().toLowerCase()
            const displaySops = sops
              .filter((s) => s.published && s.share_slug)
              .filter((s) => {
                if (!q) return true
                const num = s.sop_number != null ? String(s.sop_number) : ''
                return (
                  (s.title ?? '').toLowerCase().includes(q) ||
                  num.includes(q)
                )
              })
            const totalCount = sops.length
            return displaySops.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {totalCount === 0
                  ? 'No SOPs yet. Create one from Create / Edit SOPs.'
                  : 'No published SOPs to view yet. Publish one from the editor.'}
              </div>
            ) : (
              <div className="space-y-1.5">
                {displaySops.map((sop) => (
                  <div
                    key={sop.id}
                    onClick={() => router.push(`/sop/${sop.share_slug}`)}
                    className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer touch-target"
                  >
                    <div className="flex items-stretch justify-between gap-2">
                      <div className="min-w-0 flex-1 pr-1">
                        <h3 className="font-semibold">
                          {sop.sop_number != null ? (
                            <span className="mr-2 text-xs font-bold text-gray-700 dark:text-gray-300">
                              SOP {sop.sop_number}
                            </span>
                          ) : null}
                          {sop.title}
                        </h3>
                        <div className="mt-0.5 flex items-center justify-between gap-2 min-w-0">
                          <span className="text-sm text-gray-600 dark:text-gray-400 shrink-0">
                            Updated {formatSopListDate(sop.updated_at || sop.created_at)}
                          </span>
                          {sopMeta[sop.id] ? (
                            <SopAuthorByline
                              author={sopMeta[sop.id]!.creator}
                              twoRows
                              className="min-w-0 text-right"
                            />
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col items-end self-stretch shrink-0 gap-1">
                        <span className="text-[10px] leading-none font-normal px-1 py-0.5 rounded-sm bg-green-200 dark:bg-green-800 shrink-0">
                          Live
                        </span>
                        <div className="flex min-h-0 flex-1 flex-col items-end justify-end">
                          {sopMeta[sop.id] ? (
                            <SopAuthorAvatar author={sopMeta[sop.id]!.creator} size={32} />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
