'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseClient } from '@/lib/supabase/client'
import { formatSopListDate } from '@/lib/format-date'
import type { SOP } from '@/lib/types'
import { listDrafts, deleteDraft } from '@/lib/idb'
import type { DraftSOP } from '@/lib/types'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { usePaginatedList } from '@/features/sops/hooks/usePaginatedList'
import { fetchEditorSopsPage } from '@/features/sops/services/sop-lists'

/** DB SOP ids are UUIDs; local-only drafts may use nanoid and must stay visible to non–super-users. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default function EditorListPage() {
  const router = useRouter()
  const supabase = useSupabaseClient()
  const [drafts, setDrafts] = useState<DraftSOP[]>([])
  const [loading, setLoading] = useState(true)
  const [ownedSopIds, setOwnedSopIds] = useState<Set<string>>(() => new Set())
  const [isEditor, setIsEditor] = useState<boolean | null>(null)
  const [isSuperUser, setIsSuperUser] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  const fetchEditorPage = useCallback(
    (offset: number) =>
      fetchEditorSopsPage({ offset, q: debouncedSearch || undefined }),
    [debouncedSearch]
  )

  const {
    items: sops,
    setItems: setSops,
    hasMore,
    initialLoading: listLoading,
    loadingMore,
    sentinelRef,
  } = usePaginatedList<SOP>({
    fetchPage: fetchEditorPage,
    enabled: isEditor === true,
    reloadKey: debouncedSearch,
    initialLoading: false,
  })

  useEffect(() => {
    loadMe()
  }, [])

  useEffect(() => {
    if (isEditor) {
      loadDrafts()
    }
  }, [isEditor])

  useEffect(() => {
    if (!isEditor || isSuperUser) return
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('sops').select('id').eq('owner', user.id)
      setOwnedSopIds(new Set((data ?? []).map((r: { id: string }) => r.id)))
    })()
  }, [isEditor, isSuperUser, supabase])

  const visibleDrafts = useMemo(() => {
    if (isSuperUser) return drafts
    return drafts.filter((d) => ownedSopIds.has(d.id) || !UUID_REGEX.test(d.id))
  }, [drafts, isSuperUser, ownedSopIds])

  async function loadMe() {
    try {
      const [res, userRes] = await Promise.all([
        fetch('/api/user/me'),
        supabase.auth.getUser(),
      ])
      const data = await res.json()
      const editor = data?.isEditor === true
      setIsEditor(editor)
      setIsSuperUser(data?.isSuperUser === true)
      if (userRes.data?.user) setCurrentUserId(userRes.data.user.id)
      if (!editor) {
        router.replace('/dashboard')
        return
      }
    } catch {
      setIsEditor(false)
      router.replace('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  async function loadDrafts() {
    const list = await listDrafts()
    setDrafts(list)
  }

  async function handleCreateSOP() {
    if (!newTitle.trim()) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    setCreating(true)
    setCreateError(null)

    const { data, error } = await supabase
      .from('sops')
      .insert({ title: newTitle, owner: user.id, last_edited_by: user.id })
      .select()
      .single()

    setCreating(false)
    if (error) {
      setCreateError(error.message || 'Failed to create SOP. Please try again.')
      return
    }
    if (data) {
      setShowCreate(false)
      setNewTitle('')
      setCreateError(null)
      setOwnedSopIds((prev) => new Set(prev).add(data.id as string))
      // Let the editor start by creating steps; routing is chosen at publish time.
      router.push(`/editor/${data.id}`)
    }
  }

  async function handleDeleteSOP(e: React.MouseEvent, sop: SOP) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete "${sop.title}"? This cannot be undone.`)) return
    const canDelete = currentUserId === sop.owner || isSuperUser
    if (!canDelete) {
      alert('You can only delete your own SOPs, unless you are a super user.')
      return
    }
    const res = await fetch(`/api/sops/${sop.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('Failed to delete SOP:', res.status, body)
      alert((body as { error?: string })?.error ?? 'Could not delete SOP.')
      return
    }
    await deleteDraft(sop.id)
    setSops((prev) => prev.filter((s) => s.id !== sop.id))
    setOwnedSopIds((prev) => {
      const next = new Set(prev)
      next.delete(sop.id)
      return next
    })
  }

  if (loading || isEditor === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] safe-top safe-left safe-right pb-24 md:pb-4 safe-bottom bg-gray-50 dark:bg-gray-900">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 safe-top">
        <div className="flex gap-3 p-4 min-h-[44px]">
          <Link
            href="/dashboard"
            className="text-blue-600 dark:text-blue-400 touch-target px-2 py-1.5 min-w-[44px] text-sm font-medium shrink-0"
            aria-label="Back to dashboard"
          >
            ← Back
          </Link>
          <h1 className="text-xl md:text-2xl font-bold truncate flex-1">Create / Edit SOPs</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">New SOP</h2>
            {!showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg touch-target font-semibold"
              >
                + New SOP
              </button>
            )}
          </div>
          {showCreate && (
            <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value)
                  setCreateError(null)
                }}
                placeholder="SOP Title"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-white touch-target text-base mb-2"
                autoFocus
              />
              {createError && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-2">{createError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleCreateSOP}
                  disabled={creating || !newTitle.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg touch-target disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowCreate(false)
                    setNewTitle('')
                    setCreateError(null)
                  }}
                  className="flex-1 bg-gray-300 dark:bg-gray-700 text-black dark:text-white px-4 py-2 rounded-lg touch-target"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {visibleDrafts.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Drafts (Offline)</h2>
            <div className="space-y-2">
              {visibleDrafts.map((draft) => (
                <div
                  key={draft.id}
                  onClick={() => router.push(`/editor/${draft.id}`)}
                  className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg cursor-pointer touch-target"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{draft.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {draft.steps.length} steps • Not uploaded
                      </p>
                    </div>
                    <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-2 py-1 rounded">
                      Draft
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-2">
            {isSuperUser ? 'All SOPs (edit)' : 'Your SOPs'}
          </h2>
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
          {listLoading ? (
            <div className="text-center py-8 text-gray-500">Loading SOPs…</div>
          ) : sops.length === 0 && !hasMore ? (
            <div className="text-center py-8 text-gray-500">
              {debouncedSearch ? 'No SOPs match your search.' : 'No SOPs yet. Create one above.'}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {sops.map((sop) => {
                  const canDeleteSop = currentUserId === sop.owner || isSuperUser
                  return (
                    <div
                      key={sop.id}
                      onClick={() => router.push(`/editor/${sop.id}`)}
                      className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer touch-target flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold truncate">
                          {sop.sop_number != null ? `SOP ${sop.sop_number} — ` : ''}
                          {sop.title}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {sop.published ? 'Published' : 'Draft'} •{' '}
                          {formatSopListDate(sop.created_at)}
                        </p>
                      </div>
                      <div
                        className="flex items-center gap-2 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {sop.published && (
                          <span className="text-[10px] leading-none font-normal px-1 py-0.5 rounded-sm bg-green-200 dark:bg-green-800">
                            Live
                          </span>
                        )}
                        {canDeleteSop && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSOP(e, sop)}
                            className="p-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white touch-target"
                            aria-label={`Delete ${sop.title}`}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
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

      <div
        className="fixed bottom-6 right-4 z-20 md:hidden"
        style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
      >
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-lg flex items-center justify-center no-select touch-target text-2xl leading-none"
          aria-label="Create new SOP"
        >
          +
        </button>
      </div>
    </div>
  )
}
