import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  onIdTokenChanged,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirebaseApp } from "./config";

/**
 * Thin Authentication wrapper.
 *
 * Multiplayer uses Firebase Authentication with ANONYMOUS sign-in: players do
 * not need accounts, but every client still gets a stable uid that the RTDB
 * rules use to scope read/write to the rooms/secrets they belong to.
 *
 * Call `ensureSignedIn(displayName)` once before creating/joining a room.
 */

let auth: Auth | null = null;

export function getFirebaseAuth(): Auth | null {
  if (typeof window === "undefined") return null;
  const app = getFirebaseApp();
  if (!app) return null;
  if (!auth) auth = getAuth(app);
  return auth;
}

/** True once Firebase is configured; caller decides what to show otherwise. */
export function authAvailable(): boolean {
  return getFirebaseAuth() !== null;
}

/** Current signed-in user (may be null before sign-in). */
export function currentUser(): User | null {
  const instance = getFirebaseAuth();
  return instance?.currentUser ?? null;
}

/**
 * Sign the current device in anonymously (idempotent). Returns the uid or
 * throws if multiplayer hasn't been configured / sign-in failed.
 */
export async function ensureSignedIn(): Promise<string> {
  const instance = getFirebaseAuth();
  if (!instance) throw new Error("MULTIPLAYER_NOT_CONFIGURED");
  if (instance.currentUser) return instance.currentUser.uid;
  const credential = await signInAnonymously(instance);
  return credential.user.uid;
}

/** Observe the auth state; returns an unsubscribe fn. */
export function observeAuth(cb: (user: User | null) => void): () => void {
  const instance = getFirebaseAuth();
  if (!instance) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(instance, cb);
}

/** Observe token refreshes (useful to re-sync presence after mint). */
export function observeIdToken(cb: (user: User | null) => void): () => void {
  const instance = getFirebaseAuth();
  if (!instance) {
    cb(null);
    return () => {};
  }
  return onIdTokenChanged(instance, cb);
}

export async function signOutPlayer(): Promise<void> {
  const instance = getFirebaseAuth();
  if (instance) await signOut(instance);
}
