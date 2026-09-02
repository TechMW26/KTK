import { defineConfig } from "vite";
import vinext from "vinext";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

// Vite config for deploying vinext to Vercel (and other Nitro-supported
// platforms). vinext runs on top of Nitro for non-Cloudflare targets.
// See https://v3.nitro.build/deploy — Nitro auto-detects Vercel in CI.
export default defineConfig({
  plugins: [vinext(), nitro(), tailwindcss()],
});
