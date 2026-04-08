import { type RefObject, useEffect } from 'react'

const DEFAULT_ROOT_MARGIN = '240px'

export function useInfiniteScrollSentinel(
  sentinelRef: RefObject<HTMLDivElement | null>,
  loadMore: () => void,
  options: { active: boolean; observeKey?: unknown }
) {
  const { active, observeKey } = options

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !active) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore()
      },
      { root: null, rootMargin: DEFAULT_ROOT_MARGIN, threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [active, loadMore, observeKey, sentinelRef])
}
