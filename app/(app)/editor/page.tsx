'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseClient } from '@/lib/supabase/client'
import type { SOP } from '@/lib/types'
import { listDrafts } from '@/lib/idb'
import type { DraftSOP } from '@/lib/types'

export default function EditorListPage() {
  const router = useRouter()
  const supabase = useSupabaseClient()
  const [sops, setSops] = useState<SOP[]>([])
  const [drafts, setDrafts] = useState<DraftSOP[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditor, setIsEditor] = useState<boolean | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadMe()
  }, [])

  useEffect(() => {
    if (isEditor) {
      loadSOPs()
      loadDrafts()
    }
  }, [isEditor])

  async function loadMe() {
    try {
      const res = await fetch('/api/user/me')
      const data = await res.json()
      const editor = data?.isEditor === true
      setIsEditor(editor)
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

  async function loadSOPs() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('sops')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setSops(data as SOP[])
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
      .insert({ title: newTitle, owner: user.id })
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
      router.push(`/editor/${data.id}`)
    }
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
        <div className="flex items-center gap-3 p-4">
          <Link
            href="/dashboard"
            className="text-gray-600 dark:text-gray-400 touch-target px-1 min-w-[32px]"
            aria-label="Back to dashboard"
          >
            ←
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

        {drafts.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Drafts (Offline)</h2>
            <div className="space-y-2">
              {drafts.map((draft) => (
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
          <h2 className="text-lg font-semibold mb-2">All SOPs (edit)</h2>
          {sops.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No SOPs yet. Create one above.
            </div>
          ) : (
            <div className="space-y-2">
              {sops.map((sop) => (
                <div
                  key={sop.id}
                  onClick={() => router.push(`/editor/${sop.id}`)}
                  className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer touch-target"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{sop.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {sop.published ? 'Published' : 'Draft'} •{' '}
                        {new Date(sop.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {sop.published && (
                      <span className="text-xs bg-green-200 dark:bg-green-800 px-2 py-1 rounded">
                        Live
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
