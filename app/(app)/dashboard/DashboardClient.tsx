'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseClient } from '@/lib/supabase/client'
import { formatSopListDate } from '@/lib/format-date'
import type { SopAuthorMeta, SOP, TrainingModule } from '@/lib/types'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { usePaginatedList } from '@/features/sops/hooks/usePaginatedList'
import { fetchPublishedSopsPage } from '@/features/sops/services/sop-lists'
import { fetchSopAuthorsBatched } from '@/features/sops/services/sop-author'
import { PwaInstallCard } from '@/components/PwaInstallCard'
import {
  SopAuthorAvatar,
  SopAuthorByline,
} from '@/components/SopAuthorSignature'

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400'}
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function DashboardClient({
  initialIsEditor = false,
  initialIsSuperUser = false,
  initialTrainingModules = [],
}: {
  initialIsEditor?: boolean
  initialIsSuperUser?: boolean
  initialTrainingModules?: TrainingModule[]
}) {
  const [isEditor] = useState(initialIsEditor)
  const [isSuperUser] = useState(initialIsSuperUser)
  const [sopMeta, setSopMeta] = useState<Record<string, SopAuthorMeta>>({})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const [trainingModules] = useState<TrainingModule[]>(() => initialTrainingModules)
  const [trainingModuleId, setTrainingModuleId] = useState('')
  const [modulePickerOpen, setModulePickerOpen] = useState(false)
  const [moduleQuery, setModuleQuery] = useState('')
  const sopMetaRef = useRef<Record<string, SopAuthorMeta>>({})
  const router = useRouter()
  const supabase = useSupabaseClient()

  const listReloadKey = useMemo(
    () => `${debouncedSearch}\0${trainingModuleId}`,
    [debouncedSearch, trainingModuleId]
  )

  const fetchPublishedPage = useCallback(
    (offset: number) =>
      fetchPublishedSopsPage({
        offset,
        q: debouncedSearch || undefined,
        trainingModuleId: trainingModuleId || undefined,
      }),
    [debouncedSearch, trainingModuleId]
  )

  const canLoadSopList = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return !!user
  }, [supabase])

  const {
    items: sops,
    setItems: setSops,
    hasMore,
    initialLoading: loading,
    loadingMore,
    totalSops,
    sentinelRef,
  } = usePaginatedList<SOP>({
    fetchPage: fetchPublishedPage,
    enabled: true,
    reloadKey: listReloadKey,
    canLoad: canLoadSopList,
    initialLoading: true,
  })

  const publishedSopIds = useMemo(
    () => sops.filter((s) => s.published && s.share_slug).map((s) => s.id),
    [sops]
  )

  useEffect(() => {
    sopMetaRef.current = sopMeta
  }, [sopMeta])

  const selectedTrainingModule = useMemo(
    () => trainingModules.find((m) => m.id === trainingModuleId) ?? null,
    [trainingModules, trainingModuleId]
  )

  const filteredTrainingModules = useMemo(() => {
    const q = moduleQuery.trim().toLowerCase()
    if (!q) return trainingModules
    return trainingModules.filter((m) => m.name.toLowerCase().includes(q))
  }, [trainingModules, moduleQuery])

  useEffect(() => {
    if (publishedSopIds.length === 0) {
      setSopMeta({})
      return
    }
    const missing = [...new Set(publishedSopIds)].filter((id) => !sopMetaRef.current[id])
    if (missing.length === 0) return

    const ac = new AbortController()
    void (async () => {
      try {
        const authors = await fetchSopAuthorsBatched(missing, { signal: ac.signal })
        if (ac.signal.aborted) return
        if (Object.keys(authors).length > 0) {
          setSopMeta((prev) => ({ ...prev, ...authors }))
        }
      } catch {
        // ignore abort / network
      }
    })()
    return () => ac.abort()
  }, [publishedSopIds])

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
              <>
                <Link
                  href="/admin/editors"
                  className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 touch-target px-2 min-h-[2.25rem]"
                >
                  Manage editors
                </Link>
                <Link
                  href="/admin/machines"
                  className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 touch-target px-2 min-h-[2.25rem]"
                >
                  Manage machines
                </Link>
              </>
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
          className="flex w-full gap-3 items-start px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg touch-target"
        >
          <SearchIcon className="w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400 mt-0.5" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-gray-900 dark:text-gray-100 block">
              Line specific search
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 block">
              Line → leg → machine → section / station code
            </span>
          </span>
        </Link>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setModulePickerOpen((v) => !v)
              setModuleQuery('')
            }}
            className={`flex w-full items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-base touch-target text-left ${
              trainingModuleId
                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
                : ''
            }`}
            aria-expanded={modulePickerOpen}
            aria-haspopup="listbox"
          >
            <SearchIcon className="w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400" />
            <span className="min-w-0 flex-1 truncate">
              {selectedTrainingModule
                ? selectedTrainingModule.name
                : 'Training Modules Search'}
            </span>
          </button>
          {modulePickerOpen && (
            <div className="absolute z-30 mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
              <div className="p-2 border-b border-gray-200 dark:border-gray-800">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <SearchIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                  </span>
                  <input
                    value={moduleQuery}
                    onChange={(e) => setModuleQuery(e.target.value)}
                    placeholder="Search…"
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-base touch-target"
                    inputMode="search"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-auto p-1">
                <button
                  type="button"
                  onClick={() => {
                    setTrainingModuleId('')
                    setModulePickerOpen(false)
                    setModuleQuery('')
                  }}
                  className="w-full px-3 py-3 rounded-lg text-left text-base touch-target hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
                >
                  All modules
                </button>
                {filteredTrainingModules.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setTrainingModuleId(m.id)
                      setModulePickerOpen(false)
                      setModuleQuery('')
                    }}
                    className={`w-full px-3 py-3 rounded-lg text-left text-base touch-target hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      m.id === trainingModuleId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
                {filteredTrainingModules.length === 0 && (
                  <div className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400">
                    No matches.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div id="sop-list">
          <h2 className="text-lg font-semibold mb-2">SOPs</h2>
          <div className="mb-3 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <SearchIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SOP title or number… (e.g. 1207)"
              className="w-full pl-11 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-white touch-target text-base"
              aria-label="Search SOPs"
              inputMode="search"
            />
          </div>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : sops.length === 0 && !hasMore ? (
            <div className="text-center py-8 text-gray-500">
              {totalSops === 0
                ? 'No SOPs yet. Create one from Create / Edit SOPs.'
                : debouncedSearch
                  ? 'No SOPs match your search.'
                  : trainingModuleId
                    ? 'No published SOPs tagged with this module yet.'
                    : totalSops != null && totalSops > 0
                      ? 'No published SOPs to view yet. Publish one from the editor.'
                      : 'No published SOPs to view yet. Publish one from the editor.'}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                {sops.map((sop) => (
                  <div
                    key={sop.id}
                    onClick={() =>
                      router.push(
                        `/sop/${sop.share_slug}?returnTo=${encodeURIComponent('/dashboard')}`
                      )
                    }
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
              {hasMore ? (
                <div
                  ref={sentinelRef}
                  className="h-8 flex items-center justify-center py-4 text-sm text-gray-500 dark:text-gray-400"
                  aria-hidden
                >
                  {loadingMore ? 'Loading more…' : ''}
                </div>
              ) : sops.length > 0 ? (
                <p className="text-center py-3 text-xs text-gray-500 dark:text-gray-400">
                  End of list
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
