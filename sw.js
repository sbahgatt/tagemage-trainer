// Offline cache for when the app is served over http(s) (e.g. GitHub Pages).
// Network-first so updates to the question bank show up; falls back to cache offline.
const CACHE = 'tagemage-v2';
const FILES = ['./', 'index.html', 'css/app.css', 'data/bank.js', 'js/content.js', 'js/visuals.js', 'js/generators.js', 'js/core.js', 'js/ui.js', 'js/modes.js', 'js/pages.js', 'manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
