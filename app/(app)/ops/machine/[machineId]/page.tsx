'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSupabaseClient } from '@/lib/supabase/client'
import type { MachineFamilyStation, SOP } from '@/lib/types'

type MachineContextResponse = {
  machine: {
    id: string
    name: string
    code: string | null
    line_leg_id: string
    machine_family_id: string
    machine_family: { id: string; code: string; name: string; supplier?: string | null } | null
  }
  leg: { id: string; code: string; name: string; line_id: string; line: { id: string; name: string; code?: string | null } | null } | null
  stationsBySection: Record<string, MachineFamilyStation[]>
}

type ContextSopsResponse = {
  station: { station_code: number; name: string; section: string } | null
  results: {
    machine: { station: SOP[]; general: SOP[] }
    leg: { station: SOP[]; general: SOP[] }
    line: { station: SOP[]; general: SOP[] }
    family: { station: SOP[]; general: SOP[] }
  }
}

function SopLink({ sop }: { sop: SOP }) {
  if (!sop.share_slug) return null
  const label = sop.sop_number != null ? `SOP ${sop.sop_number} — ${sop.title}` : sop.title
  return (
    <Link
      href={`/sop/${sop.share_slug}`}
      className="block px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/70 transition-colors touch-target"
    >
      <div className="font-semibold">{label}</div>
    </Link>
  )
}

export default function OpsMachinePage() {
  const params = useParams()
  const machineId = params.machineId as string
  const router = useRouter()
  const supabase = useSupabaseClient()

  const [loading, setLoading] = useState(true)
  const [ctx, setCtx] = useState<MachineContextResponse | null>(null)
  const [stationInput, setStationInput] = useState('')
  const [sops, setSops] = useState<ContextSopsResponse | null>(null)
  const [sopsLoading, setSopsLoading] = useState(false)
  const [stationPickerOpen, setStationPickerOpen] = useState(false)
  const [stationQuery, setStationQuery] = useState('')

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) {
        router.replace('/auth/login')
        return
      }
      try {
        const res = await fetch(`/api/context/machine?machineId=${encodeURIComponent(machineId)}`)
        if (!res.ok) throw new Error('Failed to load machine')
        const body = (await res.json()) as MachineContextResponse
        setCtx(body)
      } finally {
        setLoading(false)
      }
    })()
  }, [machineId, router, supabase])

  const sections = useMemo(() => Object.keys(ctx?.stationsBySection ?? {}).sort(), [ctx])
  const hasStations = sections.length > 0

  const stationsFlat = useMemo(() => {
    const by = ctx?.stationsBySection ?? {}
    const all = Object.entries(by).flatMap(([section, list]) =>
      (list ?? []).map((st) => ({ ...st, _section: section }))
    )
    return all.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.station_code - b.station_code)
  }, [ctx])

  const stationCode = useMemo(() => {
    const t = stationInput.trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }, [stationInput])

  const selectedStation = useMemo(() => {
    if (stationCode == null) return null
    return stationsFlat.find((s) => s.station_code === stationCode) ?? null
  }, [stationsFlat, stationCode])

  const filteredStationOptions = useMemo(() => {
    const q = stationQuery.trim().toLowerCase()
    if (!q) return stationsFlat
    return stationsFlat.filter((s) => {
      const code = String(s.station_code)
      const name = (s.name ?? '').toLowerCase()
      return code.includes(q) || name.includes(q)
    })
  }, [stationQuery, stationsFlat])

  useEffect(() => {
    if (!ctx) return
    void (async () => {
      setSopsLoading(true)
      try {
        const qs = new URLSearchParams({ machineId: ctx.machine.id })
        if (stationCode != null) qs.set('stationCode', String(stationCode))
        const res = await fetch(`/api/context/sops?${qs.toString()}`)
        const body = (await res.json()) as ContextSopsResponse
        setSops(body)
      } finally {
        setSopsLoading(false)
      }
    })()
  }, [ctx, stationCode])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">Machine not found.</p>
      </div>
    )
  }

  const titleParts = [
    ctx.leg?.line?.name,
    ctx.leg?.name,
    ctx.machine.name,
  ].filter(Boolean)

  return (
    <div className="min-h-screen min-h-[100dvh] safe-top safe-left safe-right safe-bottom bg-gray-50 dark:bg-gray-900">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 safe-top">
        <div className="flex items-center gap-2 px-3 py-2">
          <Link
            href="/ops"
            className="text-blue-600 dark:text-blue-400 touch-target px-2 py-1.5 min-w-[44px] text-sm font-medium shrink-0"
          >
            ← Back
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold truncate">{titleParts.join(' • ')}</h1>
            {ctx.machine.machine_family ? (
              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                {ctx.machine.machine_family.name}
              </p>
            ) : null}
          </div>
        </div>
        <div className="px-3 pb-3">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Station</div>
          <div className="mt-1 relative">
            <button
              type="button"
              onClick={() => {
                if (!hasStations) return
                setStationPickerOpen((v) => !v)
                setStationQuery('')
              }}
              disabled={!hasStations}
              className="w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-base touch-target text-left disabled:opacity-60"
              aria-expanded={stationPickerOpen}
            >
              Select station…
            </button>
            {stationPickerOpen && (
              <div className="absolute z-30 mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
                <div className="p-2 border-b border-gray-200 dark:border-gray-800">
                  <input
                    value={stationQuery}
                    onChange={(e) => setStationQuery(e.target.value)}
                    placeholder="Search by number or name…"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-base touch-target"
                    inputMode="search"
                    autoFocus
                  />
                </div>
                <div className="max-h-80 overflow-auto p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStationInput('')
                      setStationPickerOpen(false)
                    }}
                    className="w-full px-3 py-3 rounded-lg text-left text-base touch-target hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    All SOPs
                  </button>
                  {filteredStationOptions.map((st) => {
                    const active = stationCode === st.station_code
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setStationInput(String(st.station_code))
                          setStationPickerOpen(false)
                        }}
                        className={`w-full px-3 py-3 rounded-lg text-left text-base touch-target hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          active ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                          {active ? '✓ ' : ''}{st.station_code} — {st.name}
                        </div>
                        {(st.section || st._section) ? (
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {st.section || st._section}
                          </div>
                        ) : null}
                      </button>
                    )
                  })}
                  {filteredStationOptions.length === 0 && (
                    <div className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400">
                      No matches.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {!hasStations && (
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              No station codes configured for this machine type yet.
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {sopsLoading ? (
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">Loading SOPs…</div>
        ) : null}

        {stationCode != null && sops?.station ? (
          <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
            <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Station {sops.station.station_code}: {sops.station.name}
            </div>
            <div className="text-xs text-amber-800/80 dark:text-amber-200/80">
              Section: {sops.station.section}
            </div>
          </div>
        ) : null}

        {/* SOP list by priority */}
        {(() => {
          const results = sops?.results
          if (!results) return null

          const scopes = ['machine', 'leg', 'line', 'family'] as const
          const scopeLabelBy: Record<(typeof scopes)[number], string> = {
            machine: 'This machine',
            leg: 'This leg',
            line: 'This line',
            family: 'Standard (machine type)',
          }

          // With a station selected: show only the highest-priority scope that has station-matched SOPs.
          if (stationCode != null) {
            const first = scopes.find((scope) => (results[scope]?.station?.length ?? 0) > 0) ?? null
            if (!first) {
              return (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  There is no SOP assigned to this section yet.
                </div>
              )
            }
            const list = results[first]!.station
            return (
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {scopeLabelBy[first]}
                </h2>
                <div className="space-y-2">
                  {list.map((sop) => (
                    <SopLink key={sop.id} sop={sop} />
                  ))}
                </div>
              </div>
            )
          }

          // No station selected: show the normal general SOP lists for each scope.
          return (
            <div className="space-y-4">
              {scopes.map((scope) => {
                const block = results[scope]
                if (!block) return null
                const generalList = block.general ?? []
                if (generalList.length === 0) return null
                return (
                  <div key={scope} className="space-y-2">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {scopeLabelBy[scope]}
                    </h2>
                    <div className="space-y-2">
                      {generalList.map((sop) => (
                        <SopLink key={sop.id} sop={sop} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

