import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import { useInfiniteScrollSentinel } from '@/hooks/useInfiniteScrollSentinel'

export type PaginatedPage<T> = {
  items: T[]
  hasMore: boolean
  totalSops?: number
}

type UsePaginatedListOptions<T> = {
  fetchPage: (offset: number) => Promise<PaginatedPage<T>>
  /** When false, no fetch runs and infinite scroll is off */
  enabled: boolean
  /** When this changes (with enabled true), list resets to page 0 */
  reloadKey: string | number
  /** If present, first page and load-more bail when this resolves false */
  canLoad?: () => Promise<boolean>
  /** Dashboard: true; editor list: false */
  initialLoading?: boolean
}

export function usePaginatedList<T>(options: UsePaginatedListOptions<T>): {
  items: T[]
  setItems: Dispatch<SetStateAction<T[]>>
  hasMore: boolean
  initialLoading: boolean
  loadingMore: boolean
  totalSops: number | null
  setTotalSops: Dispatch<SetStateAction<number | null>>
  sentinelRef: RefObject<HTMLDivElement>
} {
  const {
    fetchPage,
    enabled,
    reloadKey,
    canLoad,
    initialLoading: initialLoadingDefault = true,
  } = options

  const [items, setItems] = useState<T[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [initialLoading, setInitialLoading] = useState(initialLoadingDefault)
  const [loadingMore, setLoadingMore] = useState(false)
  const [totalSops, setTotalSops] = useState<number | null>(null)

  const fetchPageRef = useRef(fetchPage)
  fetchPageRef.current = fetchPage
  const canLoadRef = useRef(canLoad)
  canLoadRef.current = canLoad

  const listFetchGen = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null) as RefObject<HTMLDivElement>

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const gen = ++listFetchGen.current

    void (async () => {
      if (canLoadRef.current) {
        const ok = await canLoadRef.current()
        if (cancelled || listFetchGen.current !== gen) return
        if (!ok) {
          setItems([])
          setHasMore(false)
          setInitialLoading(false)
          return
        }
      }

      setInitialLoading(true)
      setHasMore(true)
      setItems([])
      try {
        const body = await fetchPageRef.current(0)
        if (cancelled || listFetchGen.current !== gen) return
        setItems(body.items)
        setHasMore(body.hasMore)
        if (body.totalSops != null) setTotalSops(body.totalSops)
      } catch {
        if (!cancelled && listFetchGen.current === gen) {
          setItems([])
          setHasMore(false)
        }
      } finally {
        if (!cancelled && listFetchGen.current === gen) setInitialLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, reloadKey])

  const loadMore = useCallback(async () => {
    if (!enabled || !hasMore || initialLoading || loadingMore) return
    if (canLoadRef.current) {
      const ok = await canLoadRef.current()
      if (!ok) return
    }

    const genAtStart = listFetchGen.current
    setLoadingMore(true)
    try {
      const body = await fetchPageRef.current(items.length)
      if (listFetchGen.current !== genAtStart) return
      setItems((prev) => [...prev, ...body.items])
      setHasMore(body.hasMore)
    } catch {
      // keep existing list
    } finally {
      if (listFetchGen.current === genAtStart) setLoadingMore(false)
    }
  }, [enabled, hasMore, initialLoading, loadingMore, items.length])

  useInfiniteScrollSentinel(sentinelRef, loadMore, {
    active: enabled && !initialLoading && hasMore,
    observeKey: items.length,
  })

  return {
    items,
    setItems,
    hasMore,
    initialLoading,
    loadingMore,
    totalSops,
    setTotalSops,
    sentinelRef,
  }
}
