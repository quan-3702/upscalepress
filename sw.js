const CACHE = 'upscalepress-v1';
const RUNTIME = 'upscalepress-lib-v1';
const ASSETS = ['./', 'index.html', 'help.html', 'privacy.html', 'style.css', 'up-core.js', 'app.js', 'up-worker.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
// the AI model ("upscalepress-model") is kept: it is large and only downloaded once
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== RUNTIME && k !== 'upscalepress-model' && k.startsWith('upscalepress')).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
  else if (url.hostname === 'cdn.jsdelivr.net') e.respondWith(caches.open(RUNTIME).then(async (c) => { const hit = await c.match(req); if (hit) return hit; const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; })); // the AI engine library: kept for offline use
});
