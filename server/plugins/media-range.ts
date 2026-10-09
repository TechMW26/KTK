import { defineMiddleware, definePlugin } from "nitro";
import { mediaRangeResponse } from "../../services/http/mediaRange";

/** Nitro's current static handler ignores Range; WebKit needs its 206 probe. */
export default definePlugin(app => {
  app.h3?.["~middleware"].unshift(defineMiddleware(async (event, next) => {
    if (!/^\/(?:video|audio)\//.test(event.url.pathname)) return next();
    const body = await next();
    if (!(body instanceof Uint8Array) || event.res.status === 304) return body;
    event.res.headers.set("Accept-Ranges", "bytes");
    const range = event.req.headers.get("range");
    const ifRange = event.req.headers.get("if-range");
    if (event.req.method !== "GET" || !range || (ifRange && ifRange !== event.res.headers.get("etag") && ifRange !== event.res.headers.get("last-modified"))) return body;
    const response = mediaRangeResponse(body, new Headers(event.res.headers), range);
    // H3 merges event headers over returned Response headers. Replace the
    // original full-file length too, or WebKit waits for nonexistent bytes.
    response.headers.forEach((value, key) => event.res.headers.set(key, value));
    return response;
  }));
});
