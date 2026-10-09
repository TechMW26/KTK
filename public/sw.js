/* Replaced with a content-based version and complete asset list at build. */
const VERSION = "__PWA_VERSION__";
const PRECACHE = /*__PRECACHE__*/["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const CACHE = `ktk-public-${VERSION}`;
const PUBLIC_ASSET = /^\/(?:_next\/static\/|cards\/|icons\/|audio\/|video\/|maps\/|models\/|(?:dealer-swipe-hand|gauntlet-hand)\.png$|favicon\.svg$|manifest\.webmanifest$|offline\.html$)/;

// Cached media is a complete 200 response; Safari requests a 206 byte slice.
async function mediaResponse(response, range, ifRange) {
  if (!range || response.status !== 200) return response;
  if (ifRange && ifRange !== response.headers.get("etag") && ifRange !== response.headers.get("last-modified")) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer();
  const size = bytes.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size || (!match[1] && Number(match[2]) === 0)) {
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  const part = bytes.slice(start, end + 1);
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(part.byteLength));
  return new Response(part, { status: 206, headers });
}

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
    if (cached) return mediaResponse(cached, request.headers.get("range"), request.headers.get("if-range"));
    const response = await fetch(request);
    // A partial response must never replace the complete cached asset.
    if (response.status === 200 && response.type !== "opaque") await cache.put(request, response.clone());
    return mediaResponse(response, request.headers.get("range"), request.headers.get("if-range"));
  })());
});
