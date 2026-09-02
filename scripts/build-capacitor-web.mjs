/**
 * build-capacitor-web.mjs
 *
 * Produces the local, server-free static web bundle that Capacitor packages
 * into the Android APK (webDir = dist/capacitor), WITHOUT disturbing the
 * Vercel SSR deployment config.
 *
 * Why: the Vercel build is server-rendered (vinext + Nitro) and can't run from
 * the Capacitor WebView filesystem. The APK needs vinext `output:"export"`
 * (static HTML), which needs a vite.config WITHOUT Nitro and next.config with
 * `output:"export"`.
 *
 * Strategy: save originals -> swap in export variants -> run `vinext build`
 * -> copy dist/client to dist/capacitor -> ALWAYS restore originals (finally).
 */
import { execFileSync } from "node:child_process";
import {
    cpSync,
    existsSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
    mkdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERCEL_VITE = path.join(root, "vite.config.ts");
const VERCEL_NEXT = path.join(root, "next.config.ts");
const EXPORT_VITE = path.join(root, "vite.config.capacitor.ts");
const EXPORT_DIR = path.join(root, "dist", "client");
const WEB_DIR = path.join(root, "dist", "capacitor");

const backupVite = VERCEL_VITE + ".capbak";
const backupNext = VERCEL_NEXT + ".capbak";

function protect(file) {
    if (existsSync(file) && !existsSync(file + ".capbak")) {
        renameSync(file, file + ".capbak");
    }
}

function run(cmd, args) {
    try {
        execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
    } catch {
        // vinext build on Windows can exit non-zero after producing its output (a
        // libuv teardown assertion in the prerender step). We rely on the
        // post-build artifact check below, not the process exit code.
        console.warn("[cap] vinext build reported a non-zero exit; checking output...");
    }
}

function writeNextExport() {
    writeFileSync(
        VERCEL_NEXT,
        `import type { NextConfig } from "next";

// TEMPORARY (build-capacitor-web) static export config - restored afterwards.
const nextConfig: NextConfig = { output: "export" };
export default nextConfig;
`,
    );
}

/** Rewrite leaked absolute .vinext font-cache paths to bundled copies. */
function patchFontPaths() {
    const html = path.join(EXPORT_DIR, "index.html");
    if (!existsSync(html)) {
        return;
    }
    let s = readFileSync(html, "utf8");
    if (!s.includes(".vinext/fonts/")) {
        console.log("[cap] No leaked .vinext font paths; nothing to patch.");
        return;
    }
    // Leaked path may contain spaces (e.g.
    // ".../Kill The King/.vinext/fonts/<hash>/<file>.woff2"). The refs appear
    // as  href="..."  and  url(...). Rewrite from the opening quote/paren
    // through ".vinext/fonts/" to the bundled web prefix.
    s = s.replace(/href="[^"<>]*?\.vinext\/fonts\//g, 'href="/_next/static/_vinext_fonts/');
    s = s.replace(/href='[^'<>]*?\.vinext\/fonts\//g, "href='/_next/static/_vinext_fonts/");
    s = s.replace(/url\([^)<>]*?\.vinext\/fonts\//g, "url(/_next/static/_vinext_fonts/");
    writeFileSync(html, s);
    console.log("[cap] Patched leaked font paths in index.html");
}

try {
    console.log("[cap] 1. Saving originals & switching to static-export config...");
    protect(VERCEL_VITE);
    protect(VERCEL_NEXT);
    writeFileSync(VERCEL_VITE, readFileSync(EXPORT_VITE, "utf8"));
    writeNextExport();

    // Wipe previous build output so index.html is regenerated each run.
    rmSync(EXPORT_DIR, { recursive: true, force: true });

    console.log("[cap] 2. Running static export build (vinext build)...");
    const vinextCli = path.join(root, "node_modules", "vinext", "dist", "cli.js");
    // Spawn the locally installed vinext CLI through node. Spawning `npx.cmd`
    // via child_process fails on some Windows shells (spawnSync ... EINVAL).
    run(process.execPath, [vinextCli, "build", "--prerender-concurrency", "1"]);

    if (!existsSync(path.join(EXPORT_DIR, "index.html"))) {
        throw new Error("Static export did not produce dist/client/index.html");
    }

    console.log("[cap] 3. Rewriting leaked font-cache paths in index.html...");
    patchFontPaths();

    console.log("[cap] 4. Copying bundle to webDir dist/capacitor ...");
    rmSync(WEB_DIR, { recursive: true, force: true });
    mkdirSync(WEB_DIR, { recursive: true });
    cpSync(EXPORT_DIR, WEB_DIR, { recursive: true });

    console.log("[cap] Done. WebDir ready at dist/capacitor. Run: npx cap sync android");
} finally {
    console.log("[cap] Restoring committed Vercel configs...");
    if (existsSync(backupVite)) {
        rmSync(VERCEL_VITE, { force: true });
        renameSync(backupVite, VERCEL_VITE);
    }
    if (existsSync(backupNext)) {
        rmSync(VERCEL_NEXT, { force: true });
        renameSync(backupNext, VERCEL_NEXT);
    }
    console.log("[cap] Restore complete. Vercel config is intact.");
}
