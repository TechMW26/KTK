import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

/**
 * Firebase client initialisation.
 *
 * Values are read from the environment at build/runtime. On Vercel these are
 * project-level Environment Variables; for local dev put them in a `.env.local`
 * file (see docs/FIREBASE_MULTIPLAYER.md).
 *
 * IMPORTANT (build-time): this framework inlines ONLY *static* property accesses
 * such as `process.env.NEXT_PUBLIC_X`. It cannot inline dynamic lookups like
 * `process.env[key]`. So each value is read with a literal access below, and
 * `isFirebaseConfigured` checks those inlined literals.
 */

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const DATABASE_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

function truthy(value: string | undefined): boolean {
  return Boolean(value && value.length > 0);
}

export function isFirebaseConfigured(): boolean {
  return truthy(API_KEY) && truthy(AUTH_DOMAIN) && truthy(DATABASE_URL) && truthy(PROJECT_ID);
}

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0];
    return app;
  }
  if (!isFirebaseConfigured()) return null;
  app = initializeApp({
    apiKey: API_KEY as string,
    authDomain: AUTH_DOMAIN as string,
    databaseURL: DATABASE_URL as string,
    projectId: PROJECT_ID as string,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || undefined,
  });
  return app;
}
