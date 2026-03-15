'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseClient } from '@/lib/supabase/client'
import type { SOP } from '@/lib/types'

export default function DashboardPage() {
  const [sops, setSops] = useState<SOP[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditor, setIsEditor] = useState<boolean | null>(null)
  const [isSuperUser, setIsSuperUser] = useState(false)
  const router = useRouter()
  const supabase = useSupabaseClient()

  useEffect(() => {
    loadSOPs()
    loadMe()
  }, [])

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

    // All authenticated users (magna.co.uk) can see all SOPs
    const { data, error } = await supabase
      .from('sops')
      .select('*')
      .order('created_at', { ascending: false })

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
        <div className="flex items-center justify-between p-4">
          <h1 className="text-xl md:text-2xl font-bold truncate">SOPs</h1>
          <div className="flex items-center gap-2">
            {isSuperUser && (
              <Link
                href="/admin/editors"
                className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 touch-target px-3 min-h-[2.25rem]"
              >
                Manage editors
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 touch-target px-3 min-h-[2.25rem]"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isEditor && (
          <Link
            href="/editor"
            className="block p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg touch-target"
          >
            <span className="font-semibold text-blue-700 dark:text-blue-300">
              Create / Edit SOPs
            </span>
            <p className="text-sm text-blue-600/80 dark:text-blue-400/80 mt-0.5">
              New SOP, drafts, and edit existing
            </p>
          </Link>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-2">SOPs</h2>
          {loading || isEditor === null ? (
            <div className="text-center py-8">Loading...</div>
          ) : (() => {
            const displaySops = sops.filter((s) => s.published && s.share_slug)
            const totalCount = sops.length
            return displaySops.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {totalCount === 0
                  ? 'No SOPs yet. Create one from Create / Edit SOPs.'
                  : 'No published SOPs to view yet. Publish one from the editor.'}
              </div>
            ) : (
              <div className="space-y-2">
                {displaySops.map((sop) => (
                  <div
                    key={sop.id}
                    onClick={() => router.push(`/sop/${sop.share_slug}`)}
                    className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer touch-target"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{sop.title}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(sop.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-xs bg-green-200 dark:bg-green-800 px-2 py-1 rounded">
                        Live
                      </span>
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
