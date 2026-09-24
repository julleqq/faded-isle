// Service worker for the 3D version (scope: this folder). Network-first, so updates
// show up on the next online launch; the cache is the fallback when offline.
// It also caches the shared modules one folder up, which the 3D game imports.

const CACHE = 'faded-isle-3d-v1';
const FILES = [
  './', 'index.html', 'style3d.css', 'manifest.webmanifest', 'vendor/three.module.min.js',
  'game3d.js', 'ink.js', 'world3d.js', 'stubs.js',
  '../style.css', '../icon-180.png', '../icon-512.png',
  '../world.js', '../content.js', '../audio.js', '../ui.js', '../art.js', '../exercises.js', '../finale.js',
  '../i18n.js', '../lang/fi.js', '../lang/pt.js',
];
const OPTIONAL = ['models.js', 'audio3d.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES).then(() => Promise.all(OPTIONAL.map(f => c.add(f).catch(() => {})))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('faded-isle-3d') && k !== CACHE).map(k => caches.delete(k))))
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
