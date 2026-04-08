import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { buildContextSopsFetchKey, parseContextSopsQueryStrings } from '@/lib/context-sops-query'
import { loadOpsMachineContextForSession } from '@/lib/server/context-machine'
import { loadContextSopsForSessionFromOpsMachineContext } from '@/lib/server/context-sops'
import type { OpsContextSopsPayload } from '@/lib/types'
import OpsMachineClient from './OpsMachineClient'

function OpsMachineFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <p className="text-gray-500">Loading…</p>
    </div>
  )
}

function searchParam(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | null {
  const v = sp[key]
  if (v == null) return null
  return (Array.isArray(v) ? v[0] : v) ?? null
}

export default async function OpsMachinePage({
  params,
  searchParams,
}: {
  params: Promise<{ machineId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { machineId } = await params
  const sp = await searchParams

  const result = await loadOpsMachineContextForSession(machineId)
  if (!result.ok) {
    if (result.error === 'unauthorized') {
      redirect('/auth/login')
    }
    notFound()
  }

  const parsed = parseContextSopsQueryStrings({
    stationCode: searchParam(sp, 'stationCode'),
    stationId: searchParam(sp, 'stationId'),
    trainingModuleId: searchParam(sp, 'trainingModuleId'),
  })

  let initialSops: OpsContextSopsPayload | null = null
  let initialSopsFetchKey: string | null = null

  if (parsed.ok) {
    const sopsResult = await loadContextSopsForSessionFromOpsMachineContext(result.data, parsed)
    if (sopsResult.ok) {
      initialSops = sopsResult.data
      initialSopsFetchKey = buildContextSopsFetchKey(
        machineId,
        parsed.stationCode,
        parsed.stationId,
        parsed.trainingModuleId
      )
    }
  }

  return (
    <Suspense fallback={<OpsMachineFallback />}>
      <OpsMachineClient
        machineId={machineId}
        initialCtx={result.data}
        initialSops={initialSops}
        initialSopsFetchKey={initialSopsFetchKey}
      />
    </Suspense>
  )
}
