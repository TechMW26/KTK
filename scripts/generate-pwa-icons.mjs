import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("@capacitor/assets"))("sharp");
mkdirSync("public/icons", { recursive: true });
const logo = readFileSync("public/cards/ktk-emblem-gold.webp");
// An opaque square canvas lets iOS/Android apply their own icon shape. The
// original logo is preserved, inset inside Android's 80% safe circle.
for (const [name, size, scale] of [["icon-48",48,.78],["icon-192",192,.78],["icon-512",512,.78],["maskable-512",512,.56],["apple-touch-icon",180,.78]]) {
  const width = Math.round(size * scale);
  const emblem = await sharp(logo).resize(width, width, { fit: "contain" }).png().toBuffer();
  const surface = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g"><stop stop-color="#352b1c"/><stop offset="1" stop-color="#101110"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  await sharp(surface).composite([{input:emblem,gravity:"centre"}]).removeAlpha().png().toFile(`public/icons/${name}.png`);
}
console.log("Generated PWA, Apple, maskable and favicon images from the existing gold logo");
