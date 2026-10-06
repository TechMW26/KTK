/**
 * Rules-only integration test for the `users/{uid}` node.
 *
 * Uses ANONYMOUS auth, which is already enabled on the project, so this proves
 * the new rules are correct WITHOUT depending on Email/Password being turned on.
 * That separation matters: it isolates "are my rules right?" from "is the
 * provider enabled?", which are different problems with different owners.
 *
 * Usage:  node --experimental-strip-types scripts/rules-users.test.ts
 */

import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signOut, connectAuthEmulator } from "firebase/auth";
import { getDatabase, ref, get, set, update, connectDatabaseEmulator } from "firebase/database";

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        if (line.trim().startsWith("#")) continue;
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match) out[match[1]] = match[2];
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

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL- ${label}${detail ? ` :: ${detail}` : ""}`);
  }
}

async function expectDenied(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    // A read of a non-existent node resolves with a null snapshot rather than
    // throwing, so treat "no data" as denied too — the point is that nothing
    // came back, not which mechanism produced that outcome.
    check(label, false, "access was ALLOWED but should have been denied");
  } catch (error) {
    const raw =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : String(error);
    // The SDK is inconsistent: `set` surfaces PERMISSION_DENIED, while `get`
    // throws a plain Error("Permission denied"). Accept both.
    const denied =
      raw.includes("permission-denied") ||
      raw.includes("PERMISSION_DENIED") ||
      /permission denied/i.test(raw);
    check(label, denied, raw);
  }
}

async function main(): Promise<void> {
  const config = {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (!config.apiKey || !config.databaseURL) {
    console.log("SKIP: Firebase env not configured.");
    process.exit(0);
  }

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getDatabase(app);

  if (env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "1") {
    const host = env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectDatabaseEmulator(db, host, Number(env.NEXT_PUBLIC_FIREBASE_EMULATOR_PORT || 9000));
  }

  const { user } = await signInAnonymously(auth);
  const uid = user.uid;
  console.log(`\n(anonymous uid ${uid.slice(0, 8)}… )`);

  console.log("\nA. Owner may write and read their own node");
  const node = ref(db, `users/${uid}`);
  await set(node, {
    displayName: "Rules Probe",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    providers: ["anonymous"],
    emailVerified: false,
    deletedAt: null,
    // The full first-time profile as ensureProfile writes it. The statistics
    // MUST be included here: their "never decrease" clause reads data.val(),
    // which is null on a brand-new node, so an unguarded rule rejects the whole
    // write and no profile is ever created. This is the regression that test.
    name: "",
    country: "",
    dateOfBirth: "",
    matchesPlayed: 0,
    matchesWon: 0,
  });
  const snap = await get(node);
  check("owner write accepted", snap.exists());
  check("displayName persisted", snap.val()?.displayName === "Rules Probe");
  check("first-time statistics accepted at zero", snap.val()?.matchesPlayed === 0);

  console.log("\nB. Validation rejects bad values");
  await expectDenied(
    "rejects a non-allow-listed field (balance)",
    () => set(ref(db, `users/${uid}/balance`), 9999),
  );
  await expectDenied(
    "rejects displayName longer than 24 chars",
    () => set(ref(db, `users/${uid}/displayName`), "x".repeat(25)),
  );
  await expectDenied(
    "rejects a non-boolean emailVerified",
    () => set(ref(db, `users/${uid}/emailVerified`), "yes"),
  );
  await expectDenied(
    "rejects a negative matchesPlayed",
    () => set(ref(db, `users/${uid}/matchesPlayed`), -1),
  );
  await expectDenied(
    "rejects a fractional matchesWon",
    () => set(ref(db, `users/${uid}/matchesWon`), 1.5),
  );
  await expectDenied(
    "rejects a name longer than 32 chars",
    () => set(ref(db, `users/${uid}/name`), "x".repeat(33)),
  );
  await expectDenied(
    "rejects a malformed dateOfBirth",
    () => set(ref(db, `users/${uid}/dateOfBirth`), "17/04/2001"),
  );
  await expectDenied(
    "rejects a country longer than 2 chars",
    () => set(ref(db, `users/${uid}/country`), "India"),
  );

  console.log("\nB2. Statistics may rise but never fall");
  await set(ref(db, `users/${uid}/matchesPlayed`), 1);
  await set(ref(db, `users/${uid}/matchesWon`), 1);
  const bumped = await get(node);
  check("matchesPlayed may increase 0 -> 1", bumped.val()?.matchesPlayed === 1);
  await expectDenied(
    "rejects a decrease 1 -> 0",
    () => set(ref(db, `users/${uid}/matchesPlayed`), 0),
  );

  console.log("\nC. Cross-user access is denied");
  const otherUid = "some-other-uid-1234567890";
  await expectDenied(
    "rejects writing to another uid's node",
    () => set(ref(db, `users/${otherUid}/displayName`), "hacked"),
  );
  await expectDenied(
    "rejects reading another uid's node",
    () => get(ref(db, `users/${otherUid}`)),
  );
  await expectDenied(
    "rejects listing the whole users collection",
    () => get(ref(db, "users")),
  );

  console.log("\nC2. Unauthenticated access is impossible");
  // Sign out entirely: the old wide-open ruleset let a signed-out client read
  // everything, so this is the specific regression guard for that exposure.
  await signOut(auth);
  await expectDenied(
    "signed-out client cannot read the users collection",
    () => get(ref(db, "users")),
  );
  await expectDenied(
    "signed-out client cannot read a room's secrets node",
    () => get(ref(db, "rooms/ZZZZZZ/secrets")),
  );

  // Restore a session for the remaining checks.
  const restored = await signInAnonymously(auth);
  check("re-signing in works (guest flow intact)", Boolean(restored.user.uid));

  console.log("\nD. Update path (what updateProfile() uses)");
  // A new sign-in means a new uid, so seed a fresh node for this identity
  // before exercising the partial-update path.
  const freshUid = restored.user.uid;
  const freshNode = ref(db, `users/${freshUid}`);
  await set(freshNode, {
    displayName: "Rules Probe",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    providers: ["anonymous"],
    emailVerified: false,
    deletedAt: null,
  });
  await update(freshNode, { displayName: "Renamed", updatedAt: Date.now() });
  const after = await get(freshNode);
  check("partial update accepted", after.val()?.displayName === "Renamed");
  check("createdAt preserved by update", typeof after.val()?.createdAt === "number");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Harness error:", error?.code ?? error);
  process.exit(1);
});
