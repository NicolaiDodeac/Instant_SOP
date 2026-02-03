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
  const { request } = event
  const url = new URL(request.url)

  // Skip non-HTTP(S) schemes (chrome-extension://, file://, etc.)
  if (!url.protocol.startsWith('http')) {
    return
  }

  // Skip navigation requests - let Next.js handle routing completely
  if (request.mode === 'navigate') {
    return
  }

  // Skip all API requests (internal and external)
  // This includes Supabase auth, our API routes, and any external APIs
  // IMPORTANT: Return early without calling event.respondWith() to let the browser handle the request
  if (
    request.url.includes('/api/') ||
    request.url.includes('/auth/') ||
    request.url.includes('supabase.co') ||
    request.url.includes('supabase.io') ||
    request.url.includes('supabase') ||
    request.method !== 'GET' ||
    request.url.includes('.mp4') ||
    request.url.includes('sop-videos')
  ) {
    return // Let browser handle this request, don't intercept
  }

  // Only intercept static assets (scripts, styles, images, fonts)
  if (
    request.destination !== 'script' &&
    request.destination !== 'style' &&
    request.destination !== 'image' &&
    request.destination !== 'font'
  ) {
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      return (
        cachedResponse ||
        fetch(request, {
          redirect: 'follow',
        }).then((fetchResponse) => {
          // Only cache successful, non-redirect responses
          if (
            fetchResponse.status === 200 &&
            !fetchResponse.redirected &&
            fetchResponse.type === 'basic'
          ) {
            const responseToCache = fetchResponse.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache)
            })
          }
          return fetchResponse
        }).catch(() => {
          // If fetch fails, return cached version if available
          return cachedResponse
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
