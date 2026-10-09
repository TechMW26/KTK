import { defineConfig } from "vite";
import vinext from "vinext";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

// Vite config for deploying vinext to Vercel (and other Nitro-supported
// platforms). vinext runs on top of Nitro for non-Cloudflare targets.
// See https://v3.nitro.build/deploy — Nitro auto-detects Vercel in CI.
//
// The proxy below mirrors the `rewrites` in vercel.json. Firebase's sign-in
// iframe is served from `authDomain`; if that is a different origin from the
// page, the browser blocks its third-party storage and the request is aborted,
// so no session is written. Serving /__/auth/* from our own origin keeps the
// iframe same-origin in dev as well as production, so sign-in behaves the same
// in both.
const FIREBASE_AUTH_ORIGIN = "https://killtheking-94396.firebaseapp.com";

export default defineConfig(({ command, isPreview }) => ({
  // Nitro packages the production server. Local development uses vinext's
  // runnable RSC environments; Nitro's dev environments do not expose the
  // runner expected by @vitejs/plugin-rsc's request middleware.
  plugins: [vinext(), ...(command === "build" || isPreview ? [nitro({ plugins: ["./server/plugins/media-range.ts"] })] : []), tailwindcss()],
  server: {
    proxy: {
      // changeOrigin must be TRUE: the proxied request has to present
      // firebaseapp.com as the Host, otherwise Firebase's certificate (which
      // covers only *.firebaseapp.com) fails altname validation and the request
      // comes back 502.
      "/__/auth": { target: FIREBASE_AUTH_ORIGIN, changeOrigin: true },
      "/__/firebase": { target: FIREBASE_AUTH_ORIGIN, changeOrigin: true },
    },
  },
}));
