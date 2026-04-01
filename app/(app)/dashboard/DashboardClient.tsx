'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseClient } from '@/lib/supabase/client'
import { formatSopListDate } from '@/lib/format-date'
import type { SopAuthorMeta, SOP, TrainingModule } from '@/lib/types'
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

export default function DashboardClient() {
  const [sops, setSops] = useState<SOP[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditor, setIsEditor] = useState<boolean | null>(null)
  const [isSuperUser, setIsSuperUser] = useState(false)
  const [sopMeta, setSopMeta] = useState<Record<string, SopAuthorMeta>>({})
  const [search, setSearch] = useState('')
  const [trainingModules, setTrainingModules] = useState<TrainingModule[]>([])
  const [trainingModuleId, setTrainingModuleId] = useState('')
  const [modulePickerOpen, setModulePickerOpen] = useState(false)
  const [moduleQuery, setModuleQuery] = useState('')
  /** null = no module filter; Set = SOP ids linked to selected module */
  const [moduleSopIds, setModuleSopIds] = useState<Set<string> | null>(null)
  const [moduleFilterLoading, setModuleFilterLoading] = useState(false)
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
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      try {
        const res = await fetch('/api/context/tree')
        if (!res.ok) return
        const body = (await res.json()) as { trainingModules?: TrainingModule[] }
        setTrainingModules(
          (body.trainingModules ?? []).filter((m) => m.active !== false)
        )
      } catch {
        // ignore
      }
    })()
  }, [supabase])

  useEffect(() => {
    if (!trainingModuleId) {
      setModuleSopIds(null)
      setModuleFilterLoading(false)
      return
    }
    let cancelled = false
    setModuleFilterLoading(true)
    void (async () => {
      const { data, error } = await supabase
        .from('sop_training_modules')
        .select('sop_id')
        .eq('training_module_id', trainingModuleId)
      if (cancelled) return
      if (error) {
        setModuleSopIds(new Set())
        setModuleFilterLoading(false)
        return
      }
      setModuleSopIds(
        new Set((data ?? []).map((r: { sop_id: string }) => String(r.sop_id)))
      )
      setModuleFilterLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [trainingModuleId, supabase])

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
          {loading || isEditor === null ? (
            <div className="text-center py-8">Loading...</div>
          ) : (() => {
            const q = search.trim().toLowerCase()
            const published = sops.filter((s) => s.published && s.share_slug)
            const afterModule =
              trainingModuleId && moduleSopIds != null
                ? published.filter((s) => moduleSopIds.has(s.id))
                : published
            const displaySops = afterModule.filter((s) => {
              if (!q) return true
              const num = s.sop_number != null ? String(s.sop_number) : ''
              return (
                (s.title ?? '').toLowerCase().includes(q) ||
                num.includes(q)
              )
            })
            const totalCount = sops.length
            const publishedCount = published.length
            if (trainingModuleId && moduleFilterLoading) {
              return (
                <div className="text-center py-8 text-gray-500">Loading SOPs…</div>
              )
            }
            return displaySops.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {totalCount === 0
                  ? 'No SOPs yet. Create one from Create / Edit SOPs.'
                  : publishedCount === 0
                    ? 'No published SOPs to view yet. Publish one from the editor.'
                    : trainingModuleId && afterModule.length === 0
                      ? 'No published SOPs tagged with this module yet.'
                      : q && afterModule.length > 0
                        ? 'No SOPs match your search.'
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
