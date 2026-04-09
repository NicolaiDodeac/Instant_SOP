'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Editor = { user_id: string; email: string | null }

export default function AdminEditorsPage() {
  const [editors, setEditors] = useState<Editor[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    loadEditors()
  }, [])

  async function loadEditors() {
    setLoading(true)
    setForbidden(false)
    setLoadError(null)
    setRemoveError(null)
    try {
      const res = await fetch('/api/admin/editors')
      if (res.status === 403) {
        setForbidden(true)
        setEditors([])
        return
      }
      if (!res.ok) {
        setEditors([])
        let message = `Failed to load editors (${res.status})`
        try {
          const errData = await res.json()
          if (typeof errData?.error === 'string') {
            message = errData.error
          }
        } catch {
          // keep status-based message
        }
        setLoadError(message)
        return
      }
      const data = await res.json()
      setEditors(data.editors ?? [])
    } catch {
      setEditors([])
      setLoadError('Could not load editors. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const email = addEmail.trim()
    if (!email) return

    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch('/api/admin/editors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setAddError(data?.error ?? 'Failed to add editor')
        return
      }
      setAddEmail('')
      setAddError(null)
      await loadEditors()
    } catch {
      setAddError('Request failed')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(userId: string) {
    setRemovingId(userId)
    setRemoveError(null)
    try {
      const res = await fetch(`/api/admin/editors?user_id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      })
      let data: { error?: string } = {}
      try {
        data = await res.json()
      } catch {
        // non-JSON body
      }
      if (!res.ok) {
        setRemoveError(data?.error ?? `Failed to remove editor (${res.status})`)
        return
      }
      await loadEditors()
    } catch {
      setRemoveError('Request failed')
    } finally {
      setRemovingId(null)
    }
  }

  const stickyHeader = (
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 safe-top">
      <div className="flex gap-3 py-3 min-h-[44px]">
        <Link
          href="/dashboard"
          className="text-blue-600 dark:text-blue-400 touch-target px-2 py-1.5 min-w-[44px] text-sm font-medium shrink-0"
          aria-label="Back to dashboard"
        >
          ← Back
        </Link>
        <h1 className="text-xl md:text-2xl font-bold truncate flex-1">Manage editors</h1>
      </div>
    </div>
  )

  if (forbidden) {
    return (
      <div className="min-h-screen min-h-[100dvh] safe-top safe-left safe-right safe-bottom bg-gray-50 dark:bg-gray-900">
        {stickyHeader}
        <div className="py-4">
          <p className="text-gray-600 dark:text-gray-400">You don’t have access to this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] safe-top safe-left safe-right pb-20 md:pb-4 safe-bottom bg-gray-50 dark:bg-gray-900">
      {stickyHeader}

      <div className="space-y-6 py-3 pb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Editors can create, edit, and publish SOPs. Only you (the super user) can add or remove
          editors here.
        </p>

        <section>
          <h2 className="text-lg font-semibold mb-3">Add editor</h2>
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={addEmail}
              onChange={(e) => {
                setAddEmail(e.target.value)
                setAddError(null)
              }}
              placeholder="colleague@magna.co.uk"
              className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-white touch-target text-base"
              disabled={adding}
            />
            <button
              type="submit"
              disabled={adding || !addEmail.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg touch-target font-medium disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </form>
          {addError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{addError}</p>
          )}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            The person must have signed in at least once so their account exists.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Editors</h2>
          {loading ? (
            <div className="text-gray-500 dark:text-gray-400">Loading…</div>
          ) : loadError ? (
            <div className="py-4 space-y-3">
              <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
              <button
                type="button"
                onClick={() => loadEditors()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg touch-target font-medium"
              >
                Retry
              </button>
            </div>
          ) : editors.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400 py-4">
              No editors yet. Add one by email above.
            </div>
          ) : (
            <ul className="space-y-2">
              {editors.map((e) => (
                <li
                  key={e.user_id}
                  className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <span className="truncate text-gray-900 dark:text-white">
                    {e.email ?? e.user_id}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const label = e.email ?? e.user_id
                      if (
                        !confirm(
                          `Remove "${label}" as an editor? They will lose access immediately. You can add them again later by email.`
                        )
                      ) {
                        return
                      }
                      void handleRemove(e.user_id)
                    }}
                    disabled={removingId === e.user_id}
                    className="shrink-0 text-red-600 dark:text-red-400 hover:underline text-sm touch-target disabled:opacity-50"
                  >
                    {removingId === e.user_id ? 'Removing…' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {removeError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{removeError}</p>
          )}
        </section>
      </div>
    </div>
  )
}
