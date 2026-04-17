'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatMachineFamilyLabel } from '@/lib/format-machine-family'
import type { Line, LineLeg, Machine, MachineFamily, MachineFamilyStation } from '@/lib/types'
import {
  adminCreateMachineBodySchema,
  adminCreateMachineFamilyBodySchema,
  adminCreateStationBodySchema,
  adminPatchMachineBodySchema,
  adminPatchMachineFamilyBodySchema,
  adminPatchStationBodySchema,
} from '@/lib/validation/admin'
import { zodFirstIssueMessage } from '@/lib/validation/zod-helpers'

type MachineWithFam = Machine & { machine_family?: MachineFamily }
type LegWithMachines = LineLeg & { machines: MachineWithFam[] }
type LineWithLegs = Line & { legs: LegWithMachines[] }

type FormMode = 'add-instance' | 'create-category'

function IconTrashBasket({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.067-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  )
}

export default function AdminMachinesPage() {
  const [lines, setLines] = useState<LineWithLegs[]>([])
  const [machineFamilies, setMachineFamilies] = useState<MachineFamily[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const [formMode, setFormMode] = useState<FormMode>('add-instance')

  const [formLineId, setFormLineId] = useState('')
  const [formLegId, setFormLegId] = useState('')
  const [formFamilyId, setFormFamilyId] = useState('')
  const [formName, setFormName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  /** New machine category (family). */
  const [catName, setCatName] = useState('')
  const [catSupplier, setCatSupplier] = useState('')
  const [catUsesHmi, setCatUsesHmi] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [createCategoryError, setCreateCategoryError] = useState<string | null>(null)

  const [familyListError, setFamilyListError] = useState<string | null>(null)
  const [deletingFamilyId, setDeletingFamilyId] = useState<string | null>(null)
  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null)
  const [editingFamilyName, setEditingFamilyName] = useState('')
  const [editingFamilySupplier, setEditingFamilySupplier] = useState('')
  const [savingFamilyEdit, setSavingFamilyEdit] = useState(false)

  const [editFamilyStations, setEditFamilyStations] = useState<MachineFamilyStation[]>([])
  const [stationsLoading, setStationsLoading] = useState(false)
  const [stationsError, setStationsError] = useState<string | null>(null)
  const [newStCode, setNewStCode] = useState('')
  const [newStName, setNewStName] = useState('')
  const [addingStation, setAddingStation] = useState(false)
  const [editingStationId, setEditingStationId] = useState<string | null>(null)
  const [editStCode, setEditStCode] = useState('')
  const [editStName, setEditStName] = useState('')
  const [savingStationEdit, setSavingStationEdit] = useState(false)
  const [deletingStationId, setDeletingStationId] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  /** Line / leg picker for the “Machines on lines” section (separate from add form). */
  const [browseLineId, setBrowseLineId] = useState('')
  const [browseLegId, setBrowseLegId] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setForbidden(false)
    setLoadError(null)
    setActionError(null)
    try {
      const res = await fetch('/api/admin/machines')
      if (res.status === 403) {
        setForbidden(true)
        setLines([])
        setMachineFamilies([])
        return
      }
      if (!res.ok) {
        setLines([])
        setMachineFamilies([])
        let message = `Failed to load (${res.status})`
        try {
          const errData = await res.json()
          if (typeof errData?.error === 'string') message = errData.error
        } catch {
          // keep message
        }
        setLoadError(message)
        return
      }
      const data = await res.json()
      setLines(data.lines ?? [])
      setMachineFamilies(data.machineFamilies ?? [])
    } catch {
      setLines([])
      setMachineFamilies([])
      setLoadError('Could not load data. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const legsForSelectedLine = useMemo(() => {
    const line = lines.find((l) => l.id === formLineId)
    return line?.legs ?? []
  }, [lines, formLineId])

  useEffect(() => {
    if (!formLineId) {
      setFormLegId('')
      return
    }
    const legs = lines.find((l) => l.id === formLineId)?.legs ?? []
    if (!legs.some((lg) => lg.id === formLegId)) {
      setFormLegId(legs[0]?.id ?? '')
    }
  }, [formLineId, formLegId, lines])

  useEffect(() => {
    if (!browseLineId) {
      setBrowseLegId('')
      return
    }
    const legs = lines.find((l) => l.id === browseLineId)?.legs ?? []
    if (!legs.some((lg) => lg.id === browseLegId)) {
      setBrowseLegId(legs[0]?.id ?? '')
    }
  }, [browseLineId, browseLegId, lines])

  const browseLegsForLine = useMemo(() => {
    const line = lines.find((l) => l.id === browseLineId)
    return line?.legs ?? []
  }, [lines, browseLineId])

  const browseMachines = useMemo(() => {
    if (!browseLegId) return []
    const leg = browseLegsForLine.find((lg) => lg.id === browseLegId)
    return leg?.machines ?? []
  }, [browseLegId, browseLegsForLine])

  const sortedMachineFamilies = useMemo(() => {
    return [...machineFamilies].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    )
  }, [machineFamilies])

  const reloadFamilyStations = useCallback(async (familyId: string) => {
    setStationsLoading(true)
    setStationsError(null)
    try {
      const res = await fetch(`/api/admin/machine-families/${encodeURIComponent(familyId)}/stations`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStationsError(typeof data?.error === 'string' ? data.error : 'Failed to load stations')
        return
      }
      setEditFamilyStations((data.stations ?? []) as MachineFamilyStation[])
    } catch {
      setStationsError('Network error loading stations')
    } finally {
      setStationsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!editingFamilyId) {
      setEditFamilyStations([])
      setStationsError(null)
      setEditingStationId(null)
      setNewStCode('')
      setNewStName('')
      setEditStCode('')
      setEditStName('')
      return
    }
    void reloadFamilyStations(editingFamilyId)
  }, [editingFamilyId, reloadFamilyStations])

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!catName.trim()) return

    setCreatingCategory(true)
    setCreateCategoryError(null)
    try {
      const catParsed = adminCreateMachineFamilyBodySchema.safeParse({
        name: catName.trim(),
        supplier: catSupplier.trim() || null,
        uses_hmi_station_codes: catUsesHmi,
      })
      if (!catParsed.success) {
        setCreateCategoryError(zodFirstIssueMessage(catParsed.error))
        return
      }
      const res = await fetch('/api/admin/machine-families', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(catParsed.data),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateCategoryError(data?.error ?? 'Failed to create machine type')
        return
      }
      const inserted = data?.machineFamily as MachineFamily | undefined
      if (inserted?.id) {
        setEditingFamilyId(inserted.id)
        setEditingFamilyName(inserted.name)
        setEditingFamilySupplier(typeof inserted.supplier === 'string' ? inserted.supplier : '')
      }
      setCatName('')
      setCatSupplier('')
      setCatUsesHmi(false)
      await loadData()
    } catch {
      setCreateCategoryError('Request failed')
    } finally {
      setCreatingCategory(false)
    }
  }

  async function handleDeleteFamily(familyId: string) {
    if (
      !window.confirm(
        'Delete this machine type? You can only do this if no machines on any line use it.'
      )
    ) {
      return
    }
    setDeletingFamilyId(familyId)
    setFamilyListError(null)
    try {
      const res = await fetch(`/api/admin/machine-families/${encodeURIComponent(familyId)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFamilyListError(data?.error ?? `Failed to delete (${res.status})`)
        return
      }
      if (editingFamilyId === familyId) {
        setEditingFamilyId(null)
        setEditingFamilyName('')
        setEditingFamilySupplier('')
      }
      await loadData()
    } catch {
      setFamilyListError('Delete failed')
    } finally {
      setDeletingFamilyId(null)
    }
  }

  async function handleSaveFamilyEdit(familyId: string) {
    const n = editingFamilyName.trim()
    if (!n) return
    setSavingFamilyEdit(true)
    setFamilyListError(null)
    try {
      const patchParsed = adminPatchMachineFamilyBodySchema.safeParse({
        name: n,
        supplier: editingFamilySupplier.trim() || null,
      })
      if (!patchParsed.success) {
        setFamilyListError(zodFirstIssueMessage(patchParsed.error))
        return
      }
      const res = await fetch(`/api/admin/machine-families/${encodeURIComponent(familyId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchParsed.data),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFamilyListError(data?.error ?? 'Failed to save')
        return
      }
      setEditingFamilyId(null)
      setEditingFamilyName('')
      setEditingFamilySupplier('')
      await loadData()
    } catch {
      setFamilyListError('Save failed')
    } finally {
      setSavingFamilyEdit(false)
    }
  }

  async function handleAddFamilyStation(familyId: string, usesHmiStationCodes: boolean) {
    const name = newStName.trim()
    if (!name) {
      setStationsError('Enter a station name.')
      return
    }
    const section = name
    let station_code: number
    if (usesHmiStationCodes) {
      const code = Number.parseInt(newStCode.trim(), 10)
      if (!Number.isInteger(code)) {
        setStationsError('Enter a numeric station code.')
        return
      }
      station_code = code
    } else {
      const maxCode = editFamilyStations.reduce((m, s) => Math.max(m, s.station_code), 0)
      station_code = maxCode + 1
    }

    setAddingStation(true)
    setStationsError(null)
    try {
      const stationParsed = adminCreateStationBodySchema.safeParse({
        station_code,
        name,
        section,
        sort_order: null,
      })
      if (!stationParsed.success) {
        setStationsError(zodFirstIssueMessage(stationParsed.error))
        return
      }
      const res = await fetch(`/api/admin/machine-families/${encodeURIComponent(familyId)}/stations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stationParsed.data),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStationsError(typeof data?.error === 'string' ? data.error : 'Failed to add station')
        return
      }
      setNewStCode('')
      setNewStName('')
      await reloadFamilyStations(familyId)
    } catch {
      setStationsError('Add station failed')
    } finally {
      setAddingStation(false)
    }
  }

  async function handleDeleteFamilyStation(familyId: string, stationId: string) {
    if (!window.confirm('Delete this station? Any SOP links to it will be removed.')) {
      return
    }
    setDeletingStationId(stationId)
    setStationsError(null)
    try {
      const res = await fetch(
        `/api/admin/machine-families/${encodeURIComponent(familyId)}/stations/${encodeURIComponent(stationId)}`,
        { method: 'DELETE' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStationsError(typeof data?.error === 'string' ? data.error : 'Failed to delete station')
        return
      }
      if (editingStationId === stationId) {
        setEditingStationId(null)
      }
      await reloadFamilyStations(familyId)
    } catch {
      setStationsError('Delete failed')
    } finally {
      setDeletingStationId(null)
    }
  }

  function beginEditStation(s: MachineFamilyStation) {
    setEditingStationId(s.id)
    setEditStCode(String(s.station_code))
    setEditStName(s.name)
    setStationsError(null)
  }

  function cancelEditStation() {
    setEditingStationId(null)
    setEditStCode('')
    setEditStName('')
  }

  async function handleSaveStationEdit(familyId: string, usesHmi: boolean) {
    if (!editingStationId) return
    const name = editStName.trim()
    if (!name) {
      setStationsError('Name is required.')
      return
    }
    const section = name

    const body: { name: string; section: string; station_code?: number } = { name, section }
    if (usesHmi) {
      const code = Number.parseInt(editStCode.trim(), 10)
      if (!Number.isInteger(code)) {
        setStationsError('Station code must be a whole number.')
        return
      }
      body.station_code = code
    }

    setSavingStationEdit(true)
    setStationsError(null)
    try {
      const patchStParsed = adminPatchStationBodySchema.safeParse(body)
      if (!patchStParsed.success) {
        setStationsError(zodFirstIssueMessage(patchStParsed.error))
        return
      }
      const res = await fetch(
        `/api/admin/machine-families/${encodeURIComponent(familyId)}/stations/${encodeURIComponent(editingStationId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchStParsed.data),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStationsError(typeof data?.error === 'string' ? data.error : 'Failed to update station')
        return
      }
      cancelEditStation()
      await reloadFamilyStations(familyId)
    } catch {
      setStationsError('Update failed')
    } finally {
      setSavingStationEdit(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!formLegId || !formFamilyId || !formName.trim()) return

    setAdding(true)
    setAddError(null)
    try {
      const machineParsed = adminCreateMachineBodySchema.safeParse({
        line_leg_id: formLegId,
        machine_family_id: formFamilyId,
        name: formName.trim(),
        code: null,
      })
      if (!machineParsed.success) {
        setAddError(zodFirstIssueMessage(machineParsed.error))
        return
      }
      const res = await fetch('/api/admin/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(machineParsed.data),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data?.error ?? 'Failed to add machine')
        return
      }
      {
        const fam = machineFamilies.find((f) => f.id === formFamilyId)
        setFormName(fam?.name ?? '')
      }
      await loadData()
    } catch {
      setAddError('Request failed')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(machineId: string) {
    if (!window.confirm('Remove this machine? SOP links to this machine will be removed.')) {
      return
    }
    setDeletingId(machineId)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/machines/${encodeURIComponent(machineId)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(data?.error ?? `Failed to delete (${res.status})`)
        return
      }
      await loadData()
    } catch {
      setActionError('Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleToggleActive(machine: MachineWithFam, next: boolean) {
    setActionError(null)
    try {
      const patchParsed = adminPatchMachineBodySchema.safeParse({ active: next })
      if (!patchParsed.success) {
        setActionError(zodFirstIssueMessage(patchParsed.error))
        return
      }
      const res = await fetch(`/api/admin/machines/${encodeURIComponent(machine.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchParsed.data),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(data?.error ?? 'Failed to update')
        return
      }
      await loadData()
    } catch {
      setActionError('Update failed')
    }
  }

  async function handleSaveName(machineId: string) {
    const n = editingName.trim()
    if (!n) return
    setSavingEdit(true)
    setActionError(null)
    try {
      const patchParsed = adminPatchMachineBodySchema.safeParse({ name: n })
      if (!patchParsed.success) {
        setActionError(zodFirstIssueMessage(patchParsed.error))
        return
      }
      const res = await fetch(`/api/admin/machines/${encodeURIComponent(machineId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchParsed.data),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(data?.error ?? 'Failed to rename')
        return
      }
      setEditingId(null)
      setEditingName('')
      await loadData()
    } catch {
      setActionError('Rename failed')
    } finally {
      setSavingEdit(false)
    }
  }

  const stickyHeader = (
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 safe-top">
      <div className="flex gap-3 py-3 min-h-[44px]">
        <Link
          href="/dashboard"
          className="text-blue-600 dark:text-blue-400 touch-target px-2 py-1.5 min-w-[44px] text-sm font-medium shrink-0"
          aria-label="Back to dashboard"
        >
          ← Back
        </Link>
        <h1 className="text-xl md:text-2xl font-bold truncate flex-1">Manage machines</h1>
      </div>
    </div>
  )

  if (forbidden) {
    return (
      <div className="min-h-screen min-h-[100dvh] safe-top safe-left safe-right safe-bottom bg-gray-50 dark:bg-gray-900">
        {stickyHeader}
        <div className="py-4">
          <p className="text-gray-600 dark:text-gray-400">You don’t have access to this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] safe-top safe-left safe-right pb-20 md:pb-4 safe-bottom bg-gray-50 dark:bg-gray-900">
      {stickyHeader}

      <div className="space-y-8 max-w-4xl mx-auto py-3 pb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Add or remove machines on each line and leg. Only super users can open this page.
        </p>

        {loadError && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {loadError}
          </p>
        )}
        {actionError && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {actionError}
          </p>
        )}

        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
          <div
            role="tablist"
            aria-label="Machine admin sections"
            className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gray-200 dark:border-gray-700"
          >
            <button
              type="button"
              role="tab"
              aria-selected={formMode === 'add-instance'}
                onClick={() => {
                  setFormMode('add-instance')
                  setCreateCategoryError(null)
                  setFamilyListError(null)
                  setEditingFamilyId(null)
                  setEditingFamilyName('')
                  setEditingFamilySupplier('')
                }}
              className={`touch-target py-3 text-lg md:text-xl font-bold tracking-tight border-b-2 -mb-px transition-colors ${
                formMode === 'add-instance'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Add machine
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={formMode === 'create-category'}
              onClick={() => {
                setFormMode('create-category')
                setAddError(null)
                setFamilyListError(null)
              }}
              className={`touch-target py-3 text-lg md:text-xl font-bold tracking-tight border-b-2 -mb-px transition-colors ${
                formMode === 'create-category'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Create machine
            </button>
          </div>

          {formMode === 'add-instance' ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Place an existing machine <strong className="font-medium">type</strong> on a line and
              leg.
            </p>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Define a new machine <strong className="font-medium">category</strong> (catalog entry),
              including a starter HMI / zones template. Then use <strong>Add machine</strong> to put
              it on a line.
            </p>
          )}

          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : formMode === 'add-instance' ? (
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Line</span>
                  <select
                    value={formLineId}
                    onChange={(e) => {
                      setFormLineId(e.target.value)
                      setAddError(null)
                    }}
                    className="mt-1 w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base"
                    required
                  >
                    <option value="">Select line…</option>
                    {lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Leg</span>
                  <select
                    value={formLegId}
                    onChange={(e) => {
                      setFormLegId(e.target.value)
                      setAddError(null)
                    }}
                    className="mt-1 w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base"
                    required
                    disabled={!formLineId}
                  >
                    <option value="">Select leg…</option>
                    {legsForSelectedLine.map((lg) => (
                      <option key={lg.id} value={lg.id}>
                        {lg.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Machine family
                </span>
                <select
                  value={formFamilyId}
                  onChange={(e) => {
                    const id = e.target.value
                    setFormFamilyId(id)
                    setAddError(null)
                    const fam = machineFamilies.find((f) => f.id === id)
                    setFormName(fam?.name ?? '')
                  }}
                  className="mt-1 w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base"
                  required
                >
                  <option value="">Select type…</option>
                  {machineFamilies
                    .filter((f) => f.active !== false)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatMachineFamilyLabel(f)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Display name
                </span>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Filled from the machine family; change if you need a different label on the floor.
                </p>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value)
                    setAddError(null)
                  }}
                  className="mt-1 w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={
                  adding || !formLineId || !formLegId || !formFamilyId || !formName.trim()
                }
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg touch-target font-medium disabled:opacity-50"
              >
                {adding ? 'Adding…' : 'Add machine'}
              </button>
              {addError && (
                <p className="text-sm text-red-600 dark:text-red-400">{addError}</p>
              )}
            </form>
          ) : (
            <div className="space-y-6">
            <form onSubmit={handleCreateCategory} className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Display name
                </span>
                <input
                  type="text"
                  value={catName}
                  onChange={(e) => {
                    setCatName(e.target.value)
                    setCreateCategoryError(null)
                  }}
                  placeholder="e.g. Wrapper (Acme)"
                  className="mt-1 w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Supplier <span className="font-normal text-gray-500">(optional)</span>
                </span>
                <input
                  type="text"
                  value={catSupplier}
                  onChange={(e) => setCatSupplier(e.target.value)}
                  className="mt-1 w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base"
                />
              </label>
              <label className="flex items-start gap-3 touch-target cursor-pointer">
                <input
                  type="checkbox"
                  checked={catUsesHmi}
                  onChange={(e) => setCatUsesHmi(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">HMI shows numeric station codes</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Match equipment where operators use on-screen station numbers (like Stampac).
                    Turn off for name-based zones. Add stations after create from the type editor.
                  </span>
                </span>
              </label>
              <button
                type="submit"
                disabled={creatingCategory || !catName.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg touch-target font-medium disabled:opacity-50"
              >
                {creatingCategory ? 'Creating…' : 'Create machine'}
              </button>
              {createCategoryError && (
                <p className="text-sm text-red-600 dark:text-red-400">{createCategoryError}</p>
              )}
            </form>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Existing machine types
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Catalog entries used when you <strong className="font-medium">Add machine</strong> to
                a line.
              </p>
              {familyListError && (
                <p className="text-sm text-red-600 dark:text-red-400">{familyListError}</p>
              )}
              {loading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : sortedMachineFamilies.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">No machine types yet.</p>
              ) : (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 divide-y divide-gray-200 dark:divide-gray-700 max-h-[min(28rem,70vh)] overflow-y-auto">
                  {sortedMachineFamilies.map((fam) => (
                    <div key={fam.id} className="px-3 py-3">
                      {editingFamilyId === fam.id ? (
                        <div className="space-y-4 pr-1">
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editingFamilyName}
                              onChange={(e) => setEditingFamilyName(e.target.value)}
                              placeholder="Display name"
                              className="w-full sm:max-w-md px-2 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                            />
                            <input
                              type="text"
                              value={editingFamilySupplier}
                              onChange={(e) => setEditingFamilySupplier(e.target.value)}
                              placeholder="Supplier (optional)"
                              className="w-full sm:max-w-md px-2 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={savingFamilyEdit || !editingFamilyName.trim()}
                                onClick={() => void handleSaveFamilyEdit(fam.id)}
                                className="text-sm text-blue-600 dark:text-blue-400 font-medium disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                disabled={savingFamilyEdit}
                                onClick={() => {
                                  setEditingFamilyId(null)
                                  setEditingFamilyName('')
                                  setEditingFamilySupplier('')
                                }}
                                className="text-sm text-gray-600 dark:text-gray-400"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>

                          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              Stations
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Add or edit stations for this machine type.
                              {fam.uses_hmi_station_codes === true
                                ? ' With numeric HMI codes, enter the on-screen station number for each row.'
                                : ' Codes are assigned automatically; only the name is shown in the list.'}
                            </p>
                            {stationsError && (
                              <p className="text-sm text-red-600 dark:text-red-400">{stationsError}</p>
                            )}
                            {stationsLoading && editFamilyStations.length === 0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Loading stations…
                              </p>
                            ) : (
                              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {editFamilyStations.map((s) => {
                                  const usesHmi = fam.uses_hmi_station_codes === true
                                  if (editingStationId === s.id) {
                                    return (
                                      <li
                                        key={s.id}
                                        className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 space-y-2"
                                      >
                                        <div className="grid gap-2 sm:grid-cols-2">
                                          {usesHmi ? (
                                            <label className="block text-xs text-gray-600 dark:text-gray-400">
                                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                                Code
                                              </span>
                                              <input
                                                type="text"
                                                inputMode="numeric"
                                                value={editStCode}
                                                onChange={(e) => setEditStCode(e.target.value)}
                                                className="mt-0.5 w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono"
                                              />
                                            </label>
                                          ) : null}
                                          <label
                                            className={`block text-xs text-gray-600 dark:text-gray-400 ${usesHmi ? '' : 'sm:col-span-2'}`}
                                          >
                                            <span className="font-medium text-gray-700 dark:text-gray-300">
                                              Name
                                            </span>
                                            <input
                                              type="text"
                                              value={editStName}
                                              onChange={(e) => setEditStName(e.target.value)}
                                              className="mt-0.5 w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                                            />
                                          </label>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            disabled={savingStationEdit}
                                            onClick={() =>
                                              void handleSaveStationEdit(fam.id, usesHmi)
                                            }
                                            className="text-sm text-blue-600 dark:text-blue-400 font-medium disabled:opacity-50"
                                          >
                                            Save row
                                          </button>
                                          <button
                                            type="button"
                                            disabled={savingStationEdit}
                                            onClick={cancelEditStation}
                                            className="text-sm text-gray-600 dark:text-gray-400"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </li>
                                    )
                                  }
                                  return (
                                    <li
                                      key={s.id}
                                      className="flex flex-wrap items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/60 dark:bg-gray-900/50 px-2 py-2"
                                    >
                                      <div className="min-w-0 flex-1 space-y-0.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          {usesHmi ? (
                                            <span className="font-mono text-xs text-gray-800 dark:text-gray-200">
                                              {s.station_code}
                                            </span>
                                          ) : null}
                                        </div>
                                        <p className="font-medium text-gray-900 dark:text-gray-100">
                                          {s.name}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => beginEditStation(s)}
                                          disabled={Boolean(editingStationId) && editingStationId !== s.id}
                                          className="text-xs text-blue-600 dark:text-blue-400 font-medium disabled:opacity-40 px-1"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleDeleteFamilyStation(fam.id, s.id)}
                                          disabled={deletingStationId === s.id}
                                          className="text-xs text-red-600 dark:text-red-400 font-medium disabled:opacity-50 px-1"
                                        >
                                          {deletingStationId === s.id ? '…' : 'Delete'}
                                        </button>
                                      </div>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}

                            <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white/40 dark:bg-gray-900/30 p-2 space-y-2">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                Add station
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {fam.uses_hmi_station_codes === true ? (
                                  <label className="block text-xs text-gray-600 dark:text-gray-400">
                                    <span className="font-medium text-gray-700 dark:text-gray-300">
                                      Code
                                    </span>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={newStCode}
                                      onChange={(e) => setNewStCode(e.target.value)}
                                      className="mt-0.5 w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono"
                                    />
                                  </label>
                                ) : null}
                                <label
                                  className={`block text-xs text-gray-600 dark:text-gray-400 ${fam.uses_hmi_station_codes === true ? '' : 'sm:col-span-2'}`}
                                >
                                  <span className="font-medium text-gray-700 dark:text-gray-300">
                                    Name
                                  </span>
                                  <input
                                    type="text"
                                    value={newStName}
                                    onChange={(e) => setNewStName(e.target.value)}
                                    className="mt-0.5 w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                                  />
                                </label>
                              </div>
                              <button
                                type="button"
                                disabled={
                                  addingStation ||
                                  stationsLoading ||
                                  !newStName.trim() ||
                                  (fam.uses_hmi_station_codes === true && !newStCode.trim())
                                }
                                onClick={() =>
                                  void handleAddFamilyStation(
                                    fam.id,
                                    fam.uses_hmi_station_codes === true
                                  )
                                }
                                className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md font-medium disabled:opacity-50"
                              >
                                {addingStation ? 'Adding…' : 'Add station'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <button
                              type="button"
                              className="text-left font-semibold text-gray-900 dark:text-gray-100 hover:underline"
                              onClick={() => {
                                setEditingFamilyId(fam.id)
                                setEditingFamilyName(fam.name)
                                setEditingFamilySupplier(
                                  typeof fam.supplier === 'string' ? fam.supplier : ''
                                )
                              }}
                            >
                              {formatMachineFamilyLabel(fam)}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDeleteFamily(fam.id)}
                            disabled={deletingFamilyId === fam.id}
                            className="shrink-0 touch-target p-2 rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 disabled:opacity-50"
                            title="Delete machine type"
                            aria-label={`Delete machine type ${fam.name}`}
                          >
                            {deletingFamilyId === fam.id ? (
                              <span className="block w-5 h-5 text-center text-sm leading-5">…</span>
                            ) : (
                              <IconTrashBasket className="block" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          )}
        </section>

        {formMode === 'add-instance' && (
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
          <h2 className="text-lg font-semibold">Machines on lines</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Pick a line, then a leg, to view and edit machines on that leg.
          </p>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : lines.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No lines yet. Run the Magna seed or add lines in the database.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Line</span>
                  <select
                    value={browseLineId}
                    onChange={(e) => {
                      setBrowseLineId(e.target.value)
                      setActionError(null)
                    }}
                    className="mt-1 w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base"
                  >
                    <option value="">Select line…</option>
                    {lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Leg</span>
                  <select
                    value={browseLegId}
                    onChange={(e) => {
                      setBrowseLegId(e.target.value)
                      setActionError(null)
                    }}
                    className="mt-1 w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base"
                    disabled={!browseLineId}
                  >
                    <option value="">Select leg…</option>
                    {browseLegsForLine.map((lg) => (
                      <option key={lg.id} value={lg.id}>
                        {lg.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {browseLineId && browseLegId ? (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 divide-y divide-gray-200 dark:divide-gray-700">
                  {browseMachines.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-gray-600 dark:text-gray-400">
                      No machines on this leg yet. Add one in the form above (use the same line and
                      leg).
                    </p>
                  ) : (
                    browseMachines.map((machine) => (
                      <div
                        key={machine.id}
                        className="px-3 py-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          {editingId === machine.id ? (
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="w-full sm:max-w-xs px-2 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={savingEdit || !editingName.trim()}
                                  onClick={() => void handleSaveName(machine.id)}
                                  className="text-sm text-blue-600 dark:text-blue-400 font-medium disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  disabled={savingEdit}
                                  onClick={() => {
                                    setEditingId(null)
                                    setEditingName('')
                                  }}
                                  className="text-sm text-gray-600 dark:text-gray-400"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="text-left font-semibold text-gray-900 dark:text-gray-100 hover:underline"
                              onClick={() => {
                                setEditingId(machine.id)
                                setEditingName(machine.name)
                              }}
                            >
                              {machine.name}
                            </button>
                          )}
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {formatMachineFamilyLabel(machine.machine_family)}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input
                              type="checkbox"
                              checked={machine.active !== false}
                              onChange={(e) => void handleToggleActive(machine, e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            Active
                          </label>
                          <button
                            type="button"
                            onClick={() => void handleDelete(machine.id)}
                            disabled={deletingId === machine.id}
                            className="text-red-600 dark:text-red-400 text-sm font-medium disabled:opacity-50"
                          >
                            {deletingId === machine.id ? '…' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Select a line and leg to see machines here.
                </p>
              )}
            </>
          )}
        </section>
        )}
      </div>
    </div>
  )
}
