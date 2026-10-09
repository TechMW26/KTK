/* Replaced with a content-based version and complete asset list at build. */
const VERSION = "__PWA_VERSION__";
const PRECACHE = /*__PRECACHE__*/["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const CACHE = `ktk-public-${VERSION}`;
const PUBLIC_ASSET = /^\/(?:_next\/static\/|cards\/|icons\/|audio\/|video\/|maps\/|models\/|(?:dealer-swipe-hand|gauntlet-hand)\.png$|favicon\.svg$|manifest\.webmanifest$|offline\.html$)/;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    // Only the public home shell is retained. Accounts, rooms, RSC requests,
    // Firebase traffic and authenticated navigation are never cached.
    const response = await fetch("/", { credentials: "omit", cache: "reload" });
    if (!response.ok) throw new Error("Public game shell unavailable");
    await cache.put("/", response);
  })());
  // No skipWaiting: never replace a running match's assets mid-game.
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("ktk-public-") && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch {
        const cache = await caches.open(CACHE);
        return await cache.match(url.pathname === "/" ? "/" : "/offline.html") || Response.error();
      }
    })());
    return;
  }
  if (url.search || !PUBLIC_ASSET.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type !== "opaque") await cache.put(request, response.clone());
    return response;
  })());
});
