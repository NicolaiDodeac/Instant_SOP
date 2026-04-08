import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getContextTreeForSession } from '@/lib/server/context-tree'
import OpsSelectClient from './OpsSelectClient'

export default async function OpsSelectPage() {
  const result = await getContextTreeForSession()
  if (!result.ok) {
    redirect('/auth/login')
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <p className="text-gray-500">Loading…</p>
        </div>
      }
    >
      <OpsSelectClient initialLines={result.data.lines} />
    </Suspense>
  )
}
