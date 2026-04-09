'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSupabaseClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const supabase = useSupabaseClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)

    const baseUrl =
      typeof process.env.NEXT_PUBLIC_APP_URL === 'string' && process.env.NEXT_PUBLIC_APP_URL
        ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
        : typeof window !== 'undefined'
          ? window.location.origin
          : ''

    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${baseUrl}/auth/callback?next=/auth/set-password`,
    })

    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center safe-top safe-bottom safe-left safe-right py-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">Check your email</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            If an account exists for <strong>{email}</strong>, we’ve sent a link to reset your
            password. Click the link in the email to set a new password.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
            Didn’t get it? Check spam or{' '}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-blue-600 dark:text-blue-400 underline"
            >
              try again
            </button>
            .
          </p>
          <Link
            href="/auth/login"
            className="inline-block text-gray-600 dark:text-gray-400 underline touch-target"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center safe-top safe-bottom safe-left safe-right py-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2">Reset password</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Enter your email and we’ll send you a link to set a new password.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-white touch-target text-base"
              placeholder="your@email.com"
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
            {loading ? 'Sending…' : 'Send reset link'}
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
