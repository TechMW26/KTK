import { getDatabase, connectDatabaseEmulator, type Database } from "firebase/database";
import { getFirebaseApp } from "./config";

/**
 * Realtime Database singleton.
 *
 * Everything related to reading/writing Firebase lives behind the services in
 * lib/multiplayer — UI components never touch this module directly.
 */

let db: Database | null = null;
let emulatorBound = false;

export function getRTDatabase(): Database | null {
  if (typeof window === "undefined") return null;
  const app = getFirebaseApp();
  if (!app) return null;
  if (!db) db = getDatabase(app);
  bindEmulatorOnce();
  return db;
}

/**
 * Optional local-testing hook: set NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1 and the
 * emulator host/port envs to point the SDK at `firebase emulators:start`.
 */
function bindEmulatorOnce(): void {
  if (emulatorBound || !db || typeof process === "undefined") return;
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== "1") return;
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";
  const port = Number(process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_PORT || 9000);
  connectDatabaseEmulator(db, host, port);
  emulatorBound = true;
}
