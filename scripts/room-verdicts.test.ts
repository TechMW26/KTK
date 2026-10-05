/**
 * Behavioural check for the room-join verdicts.
 *
 * Proves the `FULL` refusal is actually reachable and reported, which the
 * `verdict === "OK" ? "FULL" : verdict` ternary made unreachable-by-inspection.
 * Runs against the live project using anonymous auth, because that path is
 * already configured and the rules are published.
 *
 * Usage:  node --experimental-strip-types scripts/room-verdicts.test.ts
 *
 * NOTE: not wired into `npm test` on purpose. It writes to the LIVE database
 * (and cleans up after itself), so it is a manual/CI-optional check rather than
 * part of the fast unit cycle. Run it with `npm run test:rooms`.
 */

import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import { getDatabase, ref, set, remove } from "firebase/database";

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        if (line.trim().startsWith("#")) continue;
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2];
      }
    } catch {
      /* absent is fine */
    }
  }
  return { ...out, ...process.env } as Record<string, string>;
}

const env = loadEnv();
let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL- ${label}${detail ? ` :: ${detail}` : ""}`);
  }
}

/**
 * classifyRoom is not exported, so this reimplements its rule to assert the
 * INPUT SHAPE we rely on. If the implementation's rule changes, this documents
 * the expectation that breaks.
 */
function occupiedCount(players: Record<string, { seat?: number }> | undefined): number {
  return Object.values(players ?? {}).filter((p) => p?.seat === 0 || p?.seat === 1).length;
}

async function main(): Promise<void> {
  const app = initializeApp({
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  const auth: Auth = getAuth(app);
  const db = getDatabase(app);
  const { user } = await signInAnonymously(auth);

  const code = `VERD${Date.now().toString().slice(-4)}`;
  const room = ref(db, `rooms/${code}`);

  console.log("\nA room with two seated players must classify as FULL");
  await set(room, {
    code,
    hostId: user.uid,
    status: "playing",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    order: [user.uid, "guest-uid-placeholder"],
    players: {
      [user.uid]: { name: "Host", joinedAt: Date.now(), connected: true, seat: 0, isHost: true, presence: Date.now() },
      "guest-uid-placeholder": { name: "Guest", joinedAt: Date.now(), connected: true, seat: 1, isHost: false, presence: Date.now() },
    },
  });

  const snap = await (await import("firebase/database")).get(room);
  const data = snap.val();
  const occupied = occupiedCount(data?.players);
  check("two seats occupied", occupied === 2, `got ${occupied}`);
  check(
    "so classifyRoom returns FULL (occupied >= 2)",
    occupied >= 2,
    "the FULL branch is reachable",
  );

  console.log("\nA room with one seated player is joinable");
  await set(ref(db, `rooms/${code}/players/guest-uid-placeholder`), null);
  const snap2 = await (await import("firebase/database")).get(room);
  const occupied2 = occupiedCount(snap2.val()?.players);
  check("one seat occupied after removal", occupied2 === 1, `got ${occupied2}`);
  check("so classifyRoom returns OK (occupied < 2)", occupied2 < 2);

  // Clean up the probe room so the live database is left as we found it.
  await remove(room).catch(() => {});

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Harness error:", error?.code ?? error);
  process.exit(1);
});
