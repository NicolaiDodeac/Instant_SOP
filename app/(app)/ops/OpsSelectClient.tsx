'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatMachineFamilyLabel } from '@/lib/format-machine-family'
import type { ContextTreeLine } from '@/lib/types'

const TRAINING_MODULE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default function OpsSelectClient({
  initialLines,
}: {
  initialLines: ContextTreeLine[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [lines] = useState<ContextTreeLine[]>(() => initialLines)

  const [lineId, setLineId] = useState<string>('')
  const [legId, setLegId] = useState<string>('')
  const [trainingModuleId, setTrainingModuleId] = useState<string>('')
  const [machineId, setMachineId] = useState<string>('')

  const [linePickerOpen, setLinePickerOpen] = useState(false)
  const [legPickerOpen, setLegPickerOpen] = useState(false)
  const [machinePickerOpen, setMachinePickerOpen] = useState(false)

  const trainingModuleIdFromUrl = searchParams.get('trainingModuleId')?.trim() ?? ''

  useEffect(() => {
    setTrainingModuleId(
      trainingModuleIdFromUrl && TRAINING_MODULE_ID_RE.test(trainingModuleIdFromUrl)
        ? trainingModuleIdFromUrl
        : ''
    )
  }, [trainingModuleIdFromUrl])

  const selectedLine = useMemo(() => lines.find((l) => l.id === lineId) ?? null, [lines, lineId])
  const legs = selectedLine?.legs ?? []
  const selectedLeg = useMemo(() => legs.find((l) => l.id === legId) ?? null, [legs, legId])
  const machines = selectedLeg?.machines ?? []

  const filteredLines = lines
  const filteredLegs = legs
  const filteredMachines = machines

  useEffect(() => {
    // Reset dependent selects (training module comes from dashboard URL; keep it)
    setLegId('')
    setMachineId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId])

  useEffect(() => {
    setMachineId('')
  }, [legId])

  useEffect(() => {
    if (!machineId) return
    const qs = new URLSearchParams()
    if (trainingModuleId) qs.set('trainingModuleId', trainingModuleId)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    router.push(`/ops/machine/${encodeURIComponent(machineId)}${suffix}`)
  }, [machineId, trainingModuleId, router])

  return (
    <div className="min-h-screen min-h-[100dvh] safe-top safe-left safe-right safe-bottom bg-gray-50 dark:bg-gray-900">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 safe-top">
        <div className="flex gap-3 py-3 min-h-[44px]">
          <Link
            href="/dashboard"
            className="text-blue-600 dark:text-blue-400 touch-target px-2 py-1.5 min-w-[44px] text-sm font-medium shrink-0"
            aria-label="Back to dashboard"
          >
            ← Back
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">Line specific search</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              Choose your line, leg, then machine.
              {trainingModuleId
                ? ' Training topic filter is on (from dashboard).'
                : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 max-w-lg mx-auto py-3 pb-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <div className="block">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Line</div>
            <div className="mt-1 relative">
              <button
                type="button"
                onClick={() => {
                  setLinePickerOpen((v) => !v)
                  setLegPickerOpen(false)
                  setMachinePickerOpen(false)
                }}
                className={`w-full px-3 py-3 rounded-lg border text-gray-900 dark:text-gray-100 text-base touch-target text-left ${
                  lineId
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900'
                }`}
                aria-expanded={linePickerOpen}
              >
                {selectedLine ? selectedLine.name : 'Select line…'}
              </button>
              {linePickerOpen && (
                <div className="absolute z-30 mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
                  <div className="max-h-72 overflow-auto p-1">
                    {filteredLines.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          setLineId(l.id)
                          setLinePickerOpen(false)
                        }}
                        className={`w-full px-3 py-3 rounded-lg text-left text-base touch-target hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          l.id === lineId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        {l.name}
                      </button>
                    ))}
                    {filteredLines.length === 0 && (
                      <div className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400">No matches.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="block">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Leg</div>
            <div className="mt-1 relative">
              <button
                type="button"
                onClick={() => {
                  if (!lineId) return
                  setLegPickerOpen((v) => !v)
                  setLinePickerOpen(false)
                  setMachinePickerOpen(false)
                }}
                disabled={!lineId}
                className={`w-full px-3 py-3 rounded-lg border text-gray-900 dark:text-gray-100 text-base touch-target text-left disabled:opacity-60 ${
                  legId
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900'
                }`}
                aria-expanded={legPickerOpen}
              >
                {selectedLeg ? selectedLeg.name : lineId ? 'Select leg…' : 'Select line first…'}
              </button>
              {legPickerOpen && (
                <div className="absolute z-30 mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
                  <div className="max-h-72 overflow-auto p-1">
                    {filteredLegs.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          setLegId(l.id)
                          setLegPickerOpen(false)
                        }}
                        className={`w-full px-3 py-3 rounded-lg text-left text-base touch-target hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          l.id === legId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        {l.name}
                      </button>
                    ))}
                    {filteredLegs.length === 0 && (
                      <div className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400">No matches.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="block">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Machine</div>
            <div className="mt-1 relative">
              <button
                type="button"
                onClick={() => {
                  if (!legId) return
                  setMachinePickerOpen((v) => !v)
                  setLinePickerOpen(false)
                  setLegPickerOpen(false)
                }}
                disabled={!legId}
                className={`w-full px-3 py-3 rounded-lg border text-gray-900 dark:text-gray-100 text-base touch-target text-left disabled:opacity-60 ${
                  machineId
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900'
                }`}
                aria-expanded={machinePickerOpen}
              >
                {machineId
                  ? machines.find((m) => m.id === machineId)?.name ?? 'Selected'
                  : legId
                    ? 'Select machine…'
                    : 'Select leg first…'}
              </button>
              {machinePickerOpen && (
                <div className="absolute z-30 mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
                  <div className="max-h-96 overflow-auto p-1">
                    {filteredMachines.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setMachineId(m.id)
                          setMachinePickerOpen(false)
                        }}
                        className={`w-full px-3 py-3 rounded-lg text-left text-base touch-target hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          m.id === machineId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{m.name}</div>
                        {m.machine_family ? (
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {formatMachineFamilyLabel(m.machine_family)}
                          </div>
                        ) : null}
                      </button>
                    ))}
                    {filteredMachines.length === 0 && (
                      <div className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400">No matches.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Intentionally minimal on operator flow (phone-first). */}
      </div>
    </div>
  )
}
