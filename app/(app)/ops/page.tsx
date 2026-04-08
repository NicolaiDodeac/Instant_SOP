import { Suspense } from 'react'
import OpsSelectClient from './OpsSelectClient'

export default function OpsSelectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <p className="text-gray-500">Loading…</p>
        </div>
      }
    >
      <OpsSelectClient />
    </Suspense>
  )
}
