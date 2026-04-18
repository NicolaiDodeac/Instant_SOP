'use client'

import { useEffect } from 'react'

/**
 * Root error boundary — catches uncaught errors in the app router tree.
 * Keep messaging actionable; details stay in the console.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error boundary:', error)
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-900 px-4 text-center">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Something broke on this page
        </h1>
        <p className="max-w-md text-sm text-gray-600 dark:text-gray-400">
          Try again. If it keeps happening, refresh the page or go back to the dashboard — your work in
          other tabs is usually still saved on the server.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Dashboard
          </a>
        </div>
        {process.env.NODE_ENV === 'development' && error.message ? (
          <pre className="mt-4 max-w-full overflow-x-auto rounded bg-gray-100 p-2 text-left text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {error.message}
          </pre>
        ) : null}
      </body>
    </html>
  )
}
