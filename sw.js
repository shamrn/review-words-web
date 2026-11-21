const PREFIX = `word-review:${new URL(self.registration.scope).pathname}`;
const CACHE_NAME = `${PREFIX}:v4`;
const ASSETS = [
  './', './index.html', './styles.css', './js/config.js', './js/data.js',
  './js/srs.js', './js/tts.js', './js/storage.js', './js/app.js',
  './vendor/supabase.js', './manifest.webmanifest',
];
const URLS = new Set(ASSETS.map((path) => new URL(path, self.registration.scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => (key.startsWith(PREFIX) || key === 'word-review-v1') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  if (!URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(url.href, response.clone());
      return response;
    } catch (error) {
      const saved = await cache.match(url.href);
      if (saved) return saved;
      throw error;
    }
  })());
});
