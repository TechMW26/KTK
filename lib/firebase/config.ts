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

/**
 * The authDomain to hand the SDK.
 *
 * Redirect and popup sign-in run through a hidden cross-origin iframe served
 * from `authDomain`. When that domain differs from the page's own origin, the
 * browser applies third-party storage partitioning and the iframe request is
 * aborted, so no session is ever written and the sign-in silently returns
 * nothing. Firebase documents this: the flow needs same-origin storage unless
 * the app itself is hosted on Firebase Hosting.
 *
 * The app is hosted on Vercel, so `vercel.json` proxies `/__/auth/*` back to
 * the Firebase project and we point `authDomain` at the page's own origin to
 * keep the iframe same-origin. The origin is read at runtime so localhost,
 * preview deployments and production all resolve to themselves.
 *
 * `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is kept as the fallback for any context
 * where `window` is unavailable.
 */
function resolveAuthDomain(): string {
  if (typeof window !== "undefined" && window.location?.host) {
    return window.location.host;
  }
  return AUTH_DOMAIN as string;
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
    authDomain: resolveAuthDomain(),
    databaseURL: DATABASE_URL as string,
    projectId: PROJECT_ID as string,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || undefined,
  });
  return app;
}
