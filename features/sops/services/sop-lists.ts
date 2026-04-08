import { SOP_LIST_DEFAULT_PAGE_SIZE } from '@/features/sops/sop-list-constants'
import type { SOP } from '@/lib/types'

export const SOP_LIST_PAGE_SIZE = SOP_LIST_DEFAULT_PAGE_SIZE

export type PaginatedSopsResponse = {
  items: SOP[]
  hasMore: boolean
  totalSops?: number
}

export type FetchPublishedSopsParams = {
  offset: number
  q?: string
  trainingModuleId?: string
  limit?: number
}

export async function fetchPublishedSopsPage(
  params: FetchPublishedSopsParams
): Promise<PaginatedSopsResponse> {
  const { offset, q, trainingModuleId, limit = SOP_LIST_PAGE_SIZE } = params
  const search = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  if (q) search.set('q', q)
  if (trainingModuleId) search.set('trainingModuleId', trainingModuleId)

  const res = await fetch(`/api/dashboard/published-sops?${search}`)
  if (!res.ok) {
    throw new Error('Failed to load SOPs')
  }
  return (await res.json()) as PaginatedSopsResponse
}

export type FetchEditorSopsParams = {
  offset: number
  q?: string
  limit?: number
}

export async function fetchEditorSopsPage(
  params: FetchEditorSopsParams
): Promise<PaginatedSopsResponse> {
  const { offset, q, limit = SOP_LIST_PAGE_SIZE } = params
  const search = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  if (q) search.set('q', q)

  const res = await fetch(`/api/editor/sops?${search}`)
  if (!res.ok) {
    throw new Error('Failed to load SOPs')
  }
  return (await res.json()) as PaginatedSopsResponse
}
