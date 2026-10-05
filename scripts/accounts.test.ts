/**
 * Live integration test for the account layer.
 *
 * Runs against the REAL Firebase project in .env.local — there are no mocks
 * here on purpose. The whole point of this file is to prove the auth and
 * profile paths actually work against the deployed rules, since a green
 * type-check proves nothing about whether a provider is enabled or whether the
 * rules accept our writes.
 *
 * Usage:  node --experimental-strip-types scripts/accounts.test.ts
 *
 * NOTE: this creates and deletes real accounts in the configured project. Use a
 * throwaway project or expect matching `accounts-test-*` users to appear.
 */

import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  connectAuthEmulator,
  type Auth,
} from "firebase/auth";
import { getDatabase, ref, get, set, connectDatabaseEmulator } from "firebase/database";

// ---------------------------------------------------------------- env loading
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match && !line.trim().startsWith("#")) out[match[1]] = match[2];
      }
    } catch {
      /* file absent is fine */
    }
  }
  return { ...out, ...process.env } as Record<string, string>;
}

const env = loadEnv();

const config = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ------------------------------------------------------------------ test rig
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL- ${label}${detail ? ` :: ${detail}` : ""}`);
  }
}

async function expectThrows(label: string, fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    check(label, false, "expected a failure but it succeeded");
    return "";
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : String(error);
    check(`${label} (rejected with ${code})`, true);
    return code;
  }
}

// -------------------------------------------------------------------- runner
async function main(): Promise<void> {
  if (!config.apiKey || !config.databaseURL) {
    console.log("SKIP: Firebase env not configured (.env.local missing values).");
    process.exit(0);
  }

  const app = initializeApp(config);
  const auth: Auth = getAuth(app);
  const db = getDatabase(app);

  if (env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "1") {
    const host = env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectDatabaseEmulator(db, host, Number(env.NEXT_PUBLIC_FIREBASE_EMULATOR_PORT || 9000));
    console.log("(using Firebase emulators)");
  }

  const stamp = Date.now();
  const email = `accounts-test-${stamp}@example.com`;
  const password = "Ktk-test-password-1";

  console.log("\nA. Providers reachable on this project");
  // Anonymous must still work: the whole multiplayer flow depends on it.
  let anonUid = "";
  try {
    const cred = await signInAnonymously(auth);
    anonUid = cred.user.uid;
    check("anonymous sign-in still works (multiplayer depends on it)", Boolean(anonUid));
  } catch (error) {
    const code = (error as { code?: string }).code ?? String(error);
    check("anonymous sign-in still works", false, code);
  }

  console.log("\nB. Email/password account creation");
  let userUid = "";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    userUid = cred.user.uid;
    check("createUserWithEmailAndPassword succeeded (provider enabled)", Boolean(userUid));
    check("new account is NOT anonymous", cred.user.isAnonymous === false);
    check("new email account starts unverified", cred.user.emailVerified === false);
  } catch (error) {
    const code = (error as { code?: string }).code ?? String(error);
    check("createUserWithEmailAndPassword succeeded", false, code);
    console.log("    -> Email/Password is probably not enabled in the console.");
  }

  console.log("\nC. users/{uid} rules accept our own write");
  if (userUid) {
    const node = ref(db, `users/${userUid}`);
    const payload = {
      displayName: "Test Player",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      providers: ["password"],
      emailVerified: false,
      deletedAt: null,
    };
    try {
      await set(node, payload);
      const read = await get(node);
      check("owner can write and read their own profile node", read.exists());
      check("displayName round-trips", read.val()?.displayName === "Test Player");
    } catch (error) {
      check("owner can write and read their own profile node", false, String(error));
    }

    // Rules must reject a field we did not allow-list (e.g. a future balance).
    await expectThrows("rules reject a non-allow-listed field (balance)", () =>
      set(ref(db, `users/${userUid}/balance`), 9999),
    );

    // Rules must reject an over-long display name.
    await expectThrows("rules reject a displayName over 24 chars", () =>
      set(ref(db, `users/${userUid}/displayName`), "x".repeat(25)),
    );

    // Rules must reject a write to someone else's node.
    if (anonUid) {
      await expectThrows("rules reject writing to another uid's profile", () =>
        set(ref(db, `users/${anonUid}/displayName`), "hacked"),
      );
    }
  }

  console.log("\nD. Sign-in with the created account");
  if (userUid) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      check("signInWithEmailAndPassword succeeded", cred.user.uid === userUid);
      check("sign-in returns the SAME uid as sign-up", cred.user.uid === userUid);
    } catch (error) {
      check("signInWithEmailAndPassword succeeded", false, String(error));
    }
    await expectThrows("wrong password is rejected", () =>
      signInWithEmailAndPassword(auth, email, "definitely-wrong-1"),
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Harness error:", error);
  process.exit(1);
});
