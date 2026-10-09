import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const template = readFileSync("public/sw.js", "utf8");
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
let outputs = 0;
for (const root of [".output/public", ".vercel/output/static"]) {
  if (!existsSync(path.join(root, "_next/static"))) continue;
  const files = walk(root).filter(file => /^(?:_next\/static\/|cards\/|icons\/|audio\/|video\/|(?:dealer-swipe-hand|gauntlet-hand)\.png$|favicon\.svg$|manifest\.webmanifest$|offline\.html$)/.test(path.relative(root, file).split(path.sep).join("/")));
  const digest = createHash("sha256").update(template);
  files.sort().forEach(file => { digest.update(path.relative(root, file)); digest.update(readFileSync(file)); });
  const version = digest.digest("hex").slice(0, 16);
  const urls = files.map(file => "/" + path.relative(root, file).split(path.sep).join("/"));
  const worker = template.replace("__PWA_VERSION__", version).replace(/\/\*__PRECACHE__\*\/\[[^\]]*\]/, JSON.stringify(urls));
  writeFileSync(path.join(root, "sw.js"), worker);
  // Nitro snapshots static file lengths while building. Refresh this record
  // after expanding the worker, otherwise its response is truncated.
  if (root === ".output/public") {
    const server = ".output/server/index.mjs";
    if (existsSync(server)) {
      const source = readFileSync(server, "utf8");
      const record = /("\/sw\.js":\{)([^}]+)(\})/;
      if (!record.test(source)) throw new Error("Nitro service worker asset record missing");
      const etag = createHash("sha256").update(worker).digest("hex");
      writeFileSync(server, source.replace(record, (_match, start, fields, end) => start + fields
        .replace(/size:\d+/, `size:${Buffer.byteLength(worker)}`)
        .replace(/etag:`[^`]*`/, `etag:\`"${etag}"\``) + end));
    }
  }
  console.log(`PWA ${version}: ${urls.length} public assets precached in ${root}`);
  outputs++;
}
if (!outputs) throw new Error("No production static output found for PWA packaging");
