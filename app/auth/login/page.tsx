'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.user) {
      // Wait for session to be established and cookies to be set
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        // Use window.location for a hard redirect to ensure cookies are sent to middleware
        window.location.href = '/dashboard'
      } else {
        setError('Session not established. Please try again.')
        setLoading(false)
      }
    } else {
      setError('Login failed. Please try again.')
      setLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setError('Check your email to confirm your account')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center safe-top safe-bottom safe-left safe-right p-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold mb-8 text-center">AR SOP Builder</h1>
        <form className="space-y-4" onSubmit={handleSignIn}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-white touch-target"
              placeholder="your@email.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-white touch-target"
              placeholder="••••••"
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg touch-target disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={handleSignUp}
            disabled={loading}
            className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg touch-target disabled:opacity-50"
          >
            Sign Up
          </button>
        </form>
      </div>
    </div>
  )
}
