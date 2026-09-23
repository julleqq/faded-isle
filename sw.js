// Service worker: lets the installed game open with no internet.
// Network-first, so edits you push show up on the next online launch;
// the cache is only the fallback when offline.

const CACHE = 'faded-isle-v2';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png',
  'game.js', 'world.js', 'content.js', 'audio.js', 'ui.js', 'art.js', 'exercises.js', 'finale.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
