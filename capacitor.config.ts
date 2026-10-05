import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the native Android wrapper of the KILL THE KING
 * game.
 *
 * - webDir: where the locally built, server-free static web bundle lives.
 *   `npm run build:app` (scripts/build-capacitor-web.mjs) fills this directory
 *   from vinext's static export, so the APK packages the game locally with no
 *   remote content.
 *
 * Android viewport/safe-area and back-button behavior are configured in the
 * native layer (see android/app/src/main/res + Capacitor's onBackPressed),
 * and in the web layer via the viewport meta tag / CSS env() safe-area areas.
 */
const config: CapacitorConfig = {
  appId: "com.kushagrapandey.killtheking",
  appName: "KILL THE KING",
  webDir: "dist/capacitor",
  android: {
    allowMixedContent: false,
    // Keep the app in the foreground default config; adjust if needed.
  },
  server: {
    // Serve the local files, not a remote URL.
    androidScheme: "https",
    cleartext: false,
  },
};

export default config;
