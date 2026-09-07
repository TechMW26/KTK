import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

/**
 * Firebase client initialisation.
 *
 * Values are read from the environment at build/runtime. On Vercel these are
 * project-level Environment Variables; for local dev put them in a `.env.local`
 * file (see docs/FIREBASE_MULTIPLAYER.md).
 *
 * NOTE: Firebase's REST/RTDB SDK requires the API key + project ids; these are
 * not secrets in the strict sense (they are shipped in every web client) — real
 * security comes from the RTDB Security Rules + Authentication, never from
 * hiding the config.
 *
 * `isConfigured` lets the single-player game keep working (and the UI show a
 * friendly message) when multiplayer has not been set up yet.
 */

const REQUIRED = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_DATABASE_URL",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
] as const;

function present(key: string): boolean {
  const value =
    typeof process !== "undefined" ? process.env[key] : undefined;
  return Boolean(value && value.length > 0);
}

export function isFirebaseConfigured(): boolean {
  return REQUIRED.every(present);
}

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (!isFirebaseConfigured()) return null;
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0];
    return app;
  }
  app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL as string,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID as string,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || undefined,
  });
  return app;
}
