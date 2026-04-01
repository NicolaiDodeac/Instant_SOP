'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useSupabaseClient } from '@/lib/supabase/client'
import { getPublicSiteOrigin } from '@/lib/public-site-url'
import type { MachineFamilyStation, SOP } from '@/lib/types'

const STATION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type MachineContextResponse = {
  machine: {
    id: string
    name: string
    code: string | null
    line_leg_id: string
    machine_family_id: string
    machine_family: {
      id: string
      code: string
      name: string
      supplier?: string | null
      uses_hmi_station_codes?: boolean
    } | null
  }
  leg: { id: string; code: string; name: string; line_id: string; line: { id: string; name: string; code?: string | null } | null } | null
  stationsBySection: Record<string, MachineFamilyStation[]>
}

type ContextSopsResponse = {
  station: { id: string; station_code: number; name: string; section: string } | null
  results: {
    machine: { station: SOP[]; general: SOP[] }
    leg: { station: SOP[]; general: SOP[] }
    line: { station: SOP[]; general: SOP[] }
    family: { station: SOP[]; general: SOP[] }
  }
}

const SOP_SCOPE_ORDER = ['machine', 'leg', 'line', 'family'] as const

type ScopeResults = ContextSopsResponse['results']

/** One row per SOP: machine → leg → line → family (most specific wins order). */
function mergeSopsDeduped(
  results: ScopeResults,
  bucket: 'general' | 'station'
): SOP[] {
  const seen = new Set<string>()
  const out: SOP[] = []
  for (const scope of SOP_SCOPE_ORDER) {
    const list = results[scope]?.[bucket] ?? []
    for (const sop of list) {
      if (seen.has(sop.id)) continue
      seen.add(sop.id)
      out.push(sop)
    }
  }
  return out
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
  const searchParams = useSearchParams()
  const supabase = useSupabaseClient()

  const [loading, setLoading] = useState(true)
  const [ctx, setCtx] = useState<MachineContextResponse | null>(null)
  const [stationInput, setStationInput] = useState('')
  const [sops, setSops] = useState<ContextSopsResponse | null>(null)
  const [sopsLoading, setSopsLoading] = useState(false)
  const [stationPickerOpen, setStationPickerOpen] = useState(false)
  const [stationQuery, setStationQuery] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [zoneLinkCopied, setZoneLinkCopied] = useState(false)
  const urlSeedKeyRef = useRef<string | null>(null)

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

  useEffect(() => {
    urlSeedKeyRef.current = null
  }, [machineId])

  const usesHmiStationCodes = ctx?.machine.machine_family?.uses_hmi_station_codes === true

  // Deep-link: ?stationCode= for HMI families (Stampac), ?stationId= for name-only zones.
  // useLayoutEffect so stationInput is updated before URL-sync useEffect runs (avoids clearing params).
  useLayoutEffect(() => {
    if (!ctx) return
    const key = `${machineId}|${searchParams.toString()}`
    if (urlSeedKeyRef.current === key) return
    const usesHmi = ctx.machine.machine_family?.uses_hmi_station_codes === true
    if (usesHmi) {
      const raw = searchParams.get('stationCode')
      if (raw != null && raw.trim() !== '' && Number.isFinite(Number(raw))) {
        setStationInput(raw.trim())
      } else {
        setStationInput('')
      }
    } else {
      const raw = searchParams.get('stationId')
      const id = raw?.trim() ?? ''
      if (id && STATION_ID_RE.test(id)) setStationInput(id)
      else setStationInput('')
    }
    urlSeedKeyRef.current = key
  }, [ctx, machineId, searchParams])

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
    if (!usesHmiStationCodes) return null
    const t = stationInput.trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }, [stationInput, usesHmiStationCodes])

  const stationIdParam = useMemo(() => {
    if (usesHmiStationCodes) return null
    const t = stationInput.trim()
    if (!t || !STATION_ID_RE.test(t)) return null
    return t
  }, [stationInput, usesHmiStationCodes])

  const selectedStation = useMemo(() => {
    if (usesHmiStationCodes) {
      if (stationCode == null) return null
      return stationsFlat.find((s) => s.station_code === stationCode) ?? null
    }
    if (stationIdParam == null) return null
    return stationsFlat.find((s) => s.id === stationIdParam) ?? null
  }, [stationsFlat, usesHmiStationCodes, stationCode, stationIdParam])

  const filteredStationOptions = useMemo(() => {
    const q = stationQuery.trim().toLowerCase()
    if (!q) return stationsFlat
    return stationsFlat.filter((s) => {
      const name = (s.name ?? '').toLowerCase()
      const section = String(s.section ?? '').toLowerCase()
      if (usesHmiStationCodes) {
        const code = String(s.station_code)
        return code.includes(q) || name.includes(q) || section.includes(q)
      }
      return name.includes(q) || section.includes(q)
    })
  }, [stationQuery, stationsFlat, usesHmiStationCodes])

  useEffect(() => {
    if (!ctx) return
    void (async () => {
      setSopsLoading(true)
      try {
        const qs = new URLSearchParams({ machineId: ctx.machine.id })
        const uses = ctx.machine.machine_family?.uses_hmi_station_codes === true
        if (uses && stationCode != null) qs.set('stationCode', String(stationCode))
        if (!uses && stationIdParam) qs.set('stationId', stationIdParam)
        const res = await fetch(`/api/context/sops?${qs.toString()}`)
        const body = (await res.json()) as ContextSopsResponse
        setSops(body)
      } finally {
        setSopsLoading(false)
      }
    })()
  }, [ctx, stationCode, stationIdParam])

  // Keep URL in sync so copied links / QR open the same view.
  useEffect(() => {
    if (!ctx) return
    const uses = ctx.machine.machine_family?.uses_hmi_station_codes === true
    const currentCode = searchParams.get('stationCode')
    const currentId = searchParams.get('stationId')
    if (uses) {
      const desired = stationCode != null ? String(stationCode) : null
      if ((currentCode ?? null) === desired && !currentId) return
      const qs = new URLSearchParams()
      if (desired != null) qs.set('stationCode', desired)
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      router.replace(`/ops/machine/${encodeURIComponent(machineId)}${suffix}`)
      return
    }
    const desiredId = stationIdParam
    if ((currentId ?? null) === (desiredId ?? null) && !currentCode) return
    const qs = new URLSearchParams()
    if (desiredId) qs.set('stationId', desiredId)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    router.replace(`/ops/machine/${encodeURIComponent(machineId)}${suffix}`)
  }, [ctx, machineId, router, searchParams, stationCode, stationIdParam])

  const machineContextUrl = useMemo(() => {
    const base = getPublicSiteOrigin()
    if (!base) return ''
    return `${base}/ops/machine/${encodeURIComponent(machineId)}`
  }, [machineId])

  const machineZoneContextUrl = useMemo(() => {
    if (!machineContextUrl || !ctx) return ''
    const uses = ctx.machine.machine_family?.uses_hmi_station_codes === true
    if (uses) {
      if (stationCode == null) return ''
      const qs = new URLSearchParams({ stationCode: String(stationCode) })
      return `${machineContextUrl}?${qs.toString()}`
    }
    if (stationIdParam == null) return ''
    const qs = new URLSearchParams({ stationId: stationIdParam })
    return `${machineContextUrl}?${qs.toString()}`
  }, [machineContextUrl, ctx, stationCode, stationIdParam])

  async function copyText(text: string): Promise<boolean> {
    if (!text) return false
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        return true
      } catch {
        return false
      }
    }
  }

  async function downloadQrPng(url: string, filename: string) {
    if (!url) return
    try {
      const res = await fetch(`/api/qr?url=${encodeURIComponent(url)}`)
      if (!res.ok) return
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (e) {
      console.error('QR download failed:', e)
    }
  }

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
                    placeholder={
                      usesHmiStationCodes
                        ? 'Search by number or name…'
                        : 'Search zone name…'
                    }
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
                    const active = selectedStation?.id === st.id
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setStationInput(
                            usesHmiStationCodes ? String(st.station_code) : st.id
                          )
                          setStationPickerOpen(false)
                        }}
                        className={`w-full px-3 py-3 rounded-lg text-left text-base touch-target hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          active ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                          {active ? '✓ ' : ''}
                          {usesHmiStationCodes ? `${st.station_code} — ${st.name}` : st.name}
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

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          <button
            type="button"
            onClick={() => setShareOpen((v) => !v)}
            className="w-full px-3 py-3 flex items-center justify-between gap-3 touch-target"
            aria-expanded={shareOpen}
            aria-controls="share-accordion"
          >
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Share / QR
            </span>
            <span
              className={`text-gray-600 dark:text-gray-300 transition-transform duration-150 ${
                shareOpen ? 'rotate-180' : 'rotate-0'
              }`}
              aria-hidden="true"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 7.5L10 12.5L15 7.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>

          {shareOpen ? (
            <div id="share-accordion" className="px-3 pb-3">
              <div className="pt-1">
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Machine link
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void copyText(machineContextUrl).then((ok) => {
                      if (!ok) return
                      setLinkCopied(true)
                      window.setTimeout(() => setLinkCopied(false), 2000)
                    })
                  }}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-left text-sm break-all hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors min-h-[48px]"
                  aria-label="Copy machine link"
                  disabled={!machineContextUrl}
                >
                  {linkCopied ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">Copied!</span>
                  ) : (
                    <span className="text-blue-600 dark:text-blue-400">
                      {machineContextUrl || '…'}
                    </span>
                  )}
                </button>

                {machineContextUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      void downloadQrPng(machineContextUrl, `machine-${ctx.machine.code ?? ctx.machine.id}-qr.png`)
                    }
                    className="mt-2 w-full flex flex-col items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-3 px-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors min-h-[48px]"
                    aria-label="Download machine QR code as PNG"
                  >
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Tap QR to download image
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element -- dynamic API URL */}
                    <img
                      src={`/api/qr?url=${encodeURIComponent(machineContextUrl)}`}
                      alt=""
                      width={192}
                      height={192}
                      className="w-40 h-40 object-contain"
                    />
                  </button>
                ) : null}
              </div>

              {selectedStation != null && machineZoneContextUrl ? (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Zone / station link
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void copyText(machineZoneContextUrl).then((ok) => {
                        if (!ok) return
                        setZoneLinkCopied(true)
                        window.setTimeout(() => setZoneLinkCopied(false), 2000)
                      })
                    }}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-left text-sm break-all hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors min-h-[48px]"
                    aria-label="Copy zone link"
                  >
                    {zoneLinkCopied ? (
                      <span className="text-green-600 dark:text-green-400 font-medium">Copied!</span>
                    ) : (
                      <span className="text-blue-600 dark:text-blue-400">{machineZoneContextUrl}</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void downloadQrPng(
                        machineZoneContextUrl,
                        `machine-${ctx.machine.code ?? ctx.machine.id}-zone-${
                          stationCode ?? stationIdParam ?? 'sel'
                        }-qr.png`
                      )
                    }
                    className="mt-2 w-full flex flex-col items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-3 px-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors min-h-[48px]"
                    aria-label="Download zone QR code as PNG"
                  >
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Tap QR to download image
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element -- dynamic API URL */}
                    <img
                      src={`/api/qr?url=${encodeURIComponent(machineZoneContextUrl)}`}
                      alt=""
                      width={192}
                      height={192}
                      className="w-40 h-40 object-contain"
                    />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {selectedStation != null && sops?.station ? (
          <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
            <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              {usesHmiStationCodes
                ? `Station ${sops.station.station_code}: ${sops.station.name}`
                : `Zone: ${sops.station.name}`}
            </div>
            <div className="text-xs text-amber-800/80 dark:text-amber-200/80">
              Section: {sops.station.section}
            </div>
          </div>
        ) : null}

        {/* SOP list: one deduped list (machine → leg → line → family), same pattern with or without a zone */}
        {(() => {
          const results = sops?.results
          if (!results) return null

          const list =
            selectedStation != null
              ? mergeSopsDeduped(results, 'station')
              : mergeSopsDeduped(results, 'general')

          if (list.length === 0) {
            return (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedStation != null
                  ? 'There is no SOP assigned to this section yet.'
                  : 'No SOPs apply to this machine yet.'}
              </div>
            )
          }

          return (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">SOPs</h2>
              <div className="space-y-2">
                {list.map((sop) => (
                  <SopLink key={sop.id} sop={sop} />
                ))}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

