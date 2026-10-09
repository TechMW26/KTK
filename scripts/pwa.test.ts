import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { mediaRangeResponse } from "../services/http/mediaRange.ts";

const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
assert.equal(manifest.display, "fullscreen");
assert.ok(manifest.display_override.includes("standalone"));
assert.equal(manifest.start_url, "/");
for (const icon of manifest.icons) {
  assert.ok(existsSync(`public${icon.src}`));
  const data = readFileSync(`public${icon.src}`);
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  assert.equal(icon.sizes, `${width}x${height}`);
  assert.equal(icon.type, "image/png");
}

type Handler = (event: {request?: unknown; waitUntil?: (value: Promise<unknown>) => void; respondWith?: (value: Promise<Response>) => void}) => void;
const handlers = new Map<string, Handler>();
const stored = new Map<string, Map<string, Response>>();
const key = (r: string | {url:string}) => typeof r === "string" ? r : new URL(r.url).pathname;
let online = true;
let networkResponse: Response | undefined;
const cacheApi = {
  async open(name: string) {
    if (!stored.has(name)) stored.set(name, new Map());
    const entries = stored.get(name)!;
    return {
      async addAll(paths: string[]) { for (const p of paths) entries.set(p, new Response(`asset:${p}`)); },
      async put(r: string | {url:string}, response: Response) { entries.set(key(r), response.clone()); },
      async match(r: string | {url:string}) { return entries.get(key(r))?.clone(); },
    };
  },
  async keys() { return [...stored.keys()]; },
  async delete(name: string) { return stored.delete(name); },
};
vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
  self: {location:{origin:"https://ktk.test"},clients:{claim:async()=>{}},addEventListener:(name:string,fn:Handler)=>handlers.set(name,fn)},
  caches:cacheApi, URL, Response, Headers,
  fetch:async(r:string|{url:string})=>{if(!online)throw new Error("offline");return networkResponse?.clone() ?? new Response(key(r)==="/"?"public game shell":"network asset");},
});
let pending:Promise<unknown>|undefined;
handlers.get("install")!({waitUntil:value=>{pending=value;}});await pending;
stored.set("ktk-public-old",new Map()); stored.set("unrelated-app",new Map());
handlers.get("activate")!({waitUntil:value=>{pending=value;}});await pending;
assert.ok(!stored.has("ktk-public-old"));assert.ok(stored.has("unrelated-app"));
const request = async(path:string, mode="cors", method="GET", range?:string) => {
  let response:Promise<Response>|undefined;
  handlers.get("fetch")!({request:{url:path.startsWith("https:")?path:`https://ktk.test${path}`,mode,method,headers:new Headers(range?{Range:range}:{})},respondWith:value=>{response=value;}});
  return response;
};
for (const path of ["/multiplayer?_rsc=1","/__/auth/iframe","/api/account","https://firebase.test/rooms.json","/cards/back-texture.webp?private=1"]) {
  assert.equal(await request(path),undefined,"worker must not intercept private, cross-origin, or RSC requests");
}
assert.equal(await request("/cards/back-texture.webp","cors","POST"),undefined);
online=false;
assert.equal(await (await request("/","navigate"))!.text(),"public game shell");
assert.equal(await (await request("/multiplayer","navigate"))!.text(),"asset:/offline.html");
assert.equal(await (await request("/icons/icon-192.png"))!.text(),"asset:/icons/icon-192.png");

const media = new Uint8Array([0,1,2,3,4,5,6,7,8,9]);
stored.get("ktk-public-__PWA_VERSION__")!.set("/video/intro.mp4", new Response(media, {headers:{"Content-Type":"video/mp4","Content-Length":"10"}}));
for (const [range, status, expected, contentRange] of [
  ["bytes=0-1",206,[0,1],"bytes 0-1/10"], // Safari's initial probe.
  ["bytes=4-",206,[4,5,6,7,8,9],"bytes 4-9/10"],
  ["bytes=-3",206,[7,8,9],"bytes 7-9/10"],
  ["bytes=-20",206,[0,1,2,3,4,5,6,7,8,9],"bytes 0-9/10"],
  ["bytes=8-100",206,[8,9],"bytes 8-9/10"],
  ["bytes=10-",416,[],"bytes */10"],
  ["bytes=5-2",416,[],"bytes */10"],
  ["bytes=-0",416,[],"bytes */10"],
] as const) {
  for (const response of [mediaRangeResponse(media, new Headers({"Content-Type":"video/mp4"}),range), (await request("/video/intro.mp4","cors","GET",range))!]) {
    assert.equal(response.status,status);
    assert.equal(response.headers.get("Content-Range"),contentRange);
    assert.equal(response.headers.get("Content-Length"),String(expected.length));
    assert.equal(response.headers.get("Content-Type"),"video/mp4");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[...expected]);
  }
}
assert.equal((await request("/video/intro.mp4"))!.status,200,"range requests must leave the full cached video intact");
online = true;
networkResponse = new Response(new Uint8Array([0,1]), {status:206,headers:{"Content-Range":"bytes 0-1/10"}});
assert.equal((await request("/video/uncached.mp4","cors","GET","bytes=0-1"))!.status,206);
assert.ok(!stored.get("ktk-public-__PWA_VERSION__")!.has("/video/uncached.mp4"),"partial network media cannot poison the complete-asset cache");
networkResponse = undefined;

// Reproduce Nitro's static metadata snapshot before worker expansion. The
// shipped byte count must match the final worker or browsers get truncated JS.
const fixture = mkdtempSync(path.join(tmpdir(), "ktk-pwa-build-"));
try {
  for (const dir of ["public", ".output/public/_next/static", ".output/server"]) mkdirSync(path.join(fixture, dir), {recursive:true});
  writeFileSync(path.join(fixture, "public/sw.js"), readFileSync("public/sw.js"));
  writeFileSync(path.join(fixture, ".output/public/_next/static/app.js"), "public bundle");
  writeFileSync(path.join(fixture, ".output/server/index.mjs"), 'const assets={"/sw.js":{type:`text/javascript`,etag:`"old"`,size:1,path:`../public/sw.js`}};');
  execFileSync(process.execPath, [path.resolve("scripts/build-pwa.mjs")], {cwd:fixture});
  const worker = readFileSync(path.join(fixture, ".output/public/sw.js"));
  const server = readFileSync(path.join(fixture, ".output/server/index.mjs"), "utf8");
  assert.equal(Number(server.match(/size:(\d+)/)![1]), worker.length);
  assert.ok(!server.includes('etag:`"old"`'));
  assert.ok(!worker.toString().includes("__PWA_VERSION__"));
  assert.ok(worker.toString().includes("/_next/static/app.js"));
} finally { rmSync(fixture, {recursive:true, force:true}); }
console.log("PWA manifest/icons, offline navigation and cache privacy guards passed");
