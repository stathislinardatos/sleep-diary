/* Sleep Diary service worker — app shell cache, offline-friendly */
const CACHE = "csd-v3"; // v3: shared scoring.js + Athens-locked dates

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(["./", "./manifest.json", "./config.js", "./scoring.js"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  /* Page loads: network-first so app updates show immediately; fall back to
     cache (the app shell) when offline. */
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match(e.request).then(hit => hit || caches.match("./")))
    );
    return;
  }

  /* Other assets: stale-while-revalidate — instant from cache, refresh in background. */
  e.respondWith(
    caches.open(CACHE).then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => {
        if (r && r.status === 200) c.put(e.request, r.clone());
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
