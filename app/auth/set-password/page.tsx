'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSupabaseClient } from '@/lib/supabase/client'

export default function SetPasswordPage() {
  const router = useRouter()
  const supabase = useSupabaseClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser()
      setChecking(false)
      if (!data.user) router.replace('/auth/login')
    })()
  }, [supabase, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    setError(null)

    const { error: err } = await supabase.auth.updateUser({ password })

    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    router.replace('/dashboard')
    router.refresh()
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center safe-top safe-bottom p-4">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center safe-top safe-bottom safe-left safe-right p-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2">Set new password</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Enter your new password below.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              New password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-white touch-target text-base"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium mb-2">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-white touch-target text-base"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg touch-target disabled:opacity-50"
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
        <p className="mt-6 text-center">
          <Link
            href="/auth/login"
            className="text-sm text-gray-600 dark:text-gray-400 underline touch-target"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
