// OnlyOne Homestay PMS — minimal service worker (installability + safe static caching).
//
// Deliberately conservative: this must NEVER cache Next.js's hashed build
// chunks (/_next/static/*) or API/Supabase calls. Those always hit the
// network. Caching them would risk serving a stale/broken build after a
// deploy — the app-wide equivalent of the corrupted-webpack-chunk blank-page
// bug this build has already hit once from a bad local dev cache.
//
// Scope is intentionally narrow: cache-first for the small set of truly
// static assets (manifest, icons, logo) so repeat loads/installs are fast;
// everything else (pages, data) goes straight to the network, no offline
// fallback. This app needs live Supabase data to be useful, so a fake
// "offline shell" would be more confusing than helpful.

const CACHE_NAME = 'onlyone-pms-shell-v1'
const STATIC_ASSETS = [
  '/manifest.json',
  '/logo.jpg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/favicon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // never touch cross-origin (Supabase) calls
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return

  const isStaticAsset = STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/logo-') || url.pathname.startsWith('/icon-')
  if (!isStaticAsset) return // pages/data: always network, no interception

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((res) => {
        if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone()))
        return res
      })
    })
  )
})
