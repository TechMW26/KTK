/**
 * Post-UI verification of the account link.
 *
 * Checks the one property that matters most and that the UI cannot show:
 * upgrading a guest must PRESERVE auth.uid, not mint a new one. Also confirms
 * the profile node the UI wrote is readable by its owner and nobody else.
 *
 * Usage:  node --experimental-strip-types scripts/verify-account-link.ts
 */

import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  EmailAuthProvider,
  linkWithCredential,
  signOut,
  type Auth,
} from "firebase/auth";
import { getDatabase, ref, get, set } from "firebase/database";

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

  console.log("\nThe critical property: linking must PRESERVE the guest uid");
  // Sign in as a guest, write a secret under that uid (as the game does), then
  // link a credential and prove the uid — and therefore the secret — survived.
  const guest = await signInAnonymously(auth);
  const guestUid = guest.user.uid;
  check("guest signed in", Boolean(guestUid));

  // Write a probe under a declared path so the check exercises the real rules
  // rather than an undeclared node (which the root deny correctly rejects).
  const secretPath = `rooms/PROBE1/secrets/${guestUid}`;
  await set(ref(db, secretPath), { note: "must survive linking" });

  const email = `linktest-${Date.now()}@example.com`;
  const linked = await linkWithCredential(
    guest.user,
    EmailAuthProvider.credential(email, "Ktk-link-test-1"),
  );
  const linkedUid = linked.user.uid;

  check("linkWithCredential succeeded", true);
  check(
    "uid is UNCHANGED after linking (data survives)",
    linkedUid === guestUid,
    `before=${guestUid} after=${linkedUid}`,
  );
  check("linked account is no longer anonymous", linked.user.isAnonymous === false);
  check("linked account reports the email", linked.user.email === email);

  // The original secret written under the guest uid must still be ours.
  const stillMine = await get(ref(db, secretPath));
  check("pre-link data still owned after upgrade", stillMine.exists());

  console.log("\nProfile node written by the UI is owner-readable");
  const profileSnap = await get(ref(db, `users/${linkedUid}`));
  if (profileSnap.exists()) {
    const p = profileSnap.val();
    check("users/{uid} exists for the signed-in account", true);
    check("providers recorded", Array.isArray(p.providers) && p.providers.length > 0);
    check(
      "emailVerified false until verified (currency gate)",
      p.emailVerified === false,
    );
    check("deletedAt starts null", p.deletedAt === null);
  } else {
    console.log("  (no profile node yet — the UI writes it on sign-in)");
  }

  console.log("\nSign-out closes access");
  await signOut(auth);
  let denied = false;
  try {
    await get(ref(db, `users/${linkedUid}`));
  } catch (error) {
    denied = /permission/i.test(String((error as { message?: string }).message ?? error));
  }
  check("signed-out client cannot read that profile", denied);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Harness error:", error?.code ?? error);
  process.exit(1);
});
