const CACHE_NAME = 'yjp-absensi-v4';
const STATIC_ASSETS = [
  '/login.html',
  '/css/style.css',
  '/js/auth.js',
  '/manifest.json',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// Activate: hapus cache lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first untuk API, cache-first untuk static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Abaikan request lintas domain (misal ke Supabase API)
  if (url.origin !== self.location.origin) return;

  // API calls internal — selalu network
  if (url.pathname.startsWith('/api/')) return;

  // face-api models — network only
  if (url.pathname.startsWith('/models/')) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res && res.status === 200 && event.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
