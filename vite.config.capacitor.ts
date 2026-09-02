import { defineConfig } from "vite";
import vinext from "vinext";
import tailwindcss from "@tailwindcss/vite";

/**
 * Static-export Vite config used ONLY for building the local web bundle that
 * Capacitor packages into the Android APK.
 *
 * It forces vinext into `output: "export"` (static HTML, no server) by passing
 * an inline `nextConfig` — vinext's inline config overrides the on-disk
 * `next.config.ts`, so the Vercel SSR deployment config is left untouched.
 *
 * NOTE:
 *  - The Nitro plugin is intentionally OMITTED here. Static export has no
 *    server runtime, and nitro would fight the export mode.
 *  - vinext auto-registers @vitejs/plugin-rsc (App Router) and writes the
 *    deployable static site to `dist/client/`.
 *  - @tailwindcss/vite is required so `globals.css` (`@import "tailwindcss"`)
 *    processes correctly across the RSC/client environments.
 *
 * Build with:  vite build --config vite.config.capacitor.ts
 */
export default defineConfig({
  plugins: [
    vinext({ nextConfig: { output: "export", trailingSlash: false } }),
    tailwindcss(),
  ],
});
