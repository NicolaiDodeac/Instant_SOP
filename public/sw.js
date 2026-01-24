// Service Worker for PWA
const CACHE_NAME = 'sop-builder-v1'
const STATIC_CACHE = [
  '/',
  '/dashboard',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_CACHE)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  // Skip navigation requests - let Next.js handle routing completely
  if (event.request.mode === 'navigate') {
    return
  }

  // Don't cache video files or API routes
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('.mp4') ||
    event.request.url.includes('sop-videos')
  ) {
    return
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request, {
          redirect: 'follow',
        }).then((fetchResponse) => {
          // Only cache successful, non-redirect responses
          if (
            fetchResponse.status === 200 &&
            !fetchResponse.redirected &&
            (event.request.destination === 'script' ||
              event.request.destination === 'style' ||
              event.request.destination === 'image')
          ) {
            const responseToCache = fetchResponse.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache)
            })
          }
          return fetchResponse
        })
      )
    })
  )
})

// Background sync for video uploads
self.addEventListener('sync', (event) => {
  if (event.tag === 'sop-video-uploads') {
    event.waitUntil(uploadPendingVideos())
  }
})

async function uploadPendingVideos() {
  // This would be implemented to retry failed uploads
  // For now, the client-side code handles retries
}
