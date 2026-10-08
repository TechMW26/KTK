/**
 * Source-level guard for the OAuth provider wiring.
 *
 * Facebook must be a first-class peer of Google and Apple: same
 * `linkWithRedirect` upgrade path, same single `accounts` module, and no
 * provider secret anywhere in the client. These are cheap to assert from the
 * source, and they are the things that silently regress when a provider is
 * added by copy-paste rather than through the shared helper.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const accounts = readFileSync(new URL("../lib/firebase/accounts.ts", import.meta.url), "utf8");
const dialog = readFileSync(
  new URL("../features/account/components/AccountDialog.tsx", import.meta.url),
  "utf8",
);
const screen = readFileSync(
  new URL("../features/account/components/AccountScreen.tsx", import.meta.url),
  "utf8",
);
const config = readFileSync(new URL("../lib/firebase/config.ts", import.meta.url), "utf8");

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(`         ${(err as Error).message}`);
  }
}

console.log("facebook-auth.test — Facebook is a peer of Google/Apple");

check("facebook is part of the provider union", () => {
  assert.match(accounts, /export type OAuthProviderName = "google" \| "apple" \| "facebook"/);
});

check("facebook maps to the facebook.com provider id", () => {
  const fn = accounts.match(/function oauthProviderFor[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fn, /"facebook\.com"/);
  assert.match(fn, /new OAuthProvider\(id\)/);
});

check("startFacebookSignIn upgrades the guest via the shared helper", () => {
  const fn = accounts.match(/export function startFacebookSignIn[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fn, /startOAuthSignIn\("facebook"\)/);
});

check("the guest uid is preserved with linkWithRedirect, never replaced", () => {
  const fn =
    accounts.match(/export async function startOAuthSignIn[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fn, /linkWithRedirect/);
  assert.match(fn, /isAnonymous/);
});

check("reaching the link path uses signInWithRedirect, not linkWithRedirect", () => {
  const fn = accounts.match(/export async function signInToExisting[\s\S]*?\n\}/)?.[0] ?? "";
  // Strip comments first: the doc comment names linkWithRedirect to contrast it.
  const code = fn.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(code, /signInWithRedirect/);
  assert.doesNotMatch(code, /linkWithRedirect/);
});

check("provider ids survive construction (no duplicate construction blocks)", () => {
  // Exactly one place builds providers now; a second copy is how drift starts.
  const constructions = [...accounts.matchAll(/new OAuthProvider\(/g)].length;
  assert.equal(constructions, 1, `expected 1 OAuthProvider construction, found ${constructions}`);
});

check("the collision escape hatch passes the colliding provider through", () => {
  const fn = dialog.match(/const signInToColliding[\s\S]*?\n {2}\};/)?.[0] ?? "";
  assert.match(fn, /signInToExisting\(collision\)/);
  // The old hardcoded fallback would have sent every non-Apple collision to Google.
  assert.doesNotMatch(fn, /"apple" : "google"/);
});

check("the sign-in dialog offers Facebook next to the other providers", () => {
  assert.match(dialog, /startFacebookSignIn/);
  assert.match(dialog, /CONTINUE WITH FACEBOOK/);
  assert.match(dialog, /collisionProvider: "facebook"/);
});

check("the account screen can link Facebook as an additional method", () => {
  assert.match(screen, /linkProvider\("facebook"\)/);
  assert.match(screen, /providers\.includes\("facebook\.com"\)/);
});

check("both provider labels know Facebook", () => {
  for (const [file, src] of [["AccountDialog", dialog], ["AccountScreen", screen]] as const) {
    assert.match(src, /"facebook\.com"\) return "Facebook"/, `${file} is missing the label`);
  }
});

check("no Facebook secret can reach the client bundle", () => {
  // The app secret must live only in the Firebase console.
  assert.doesNotMatch(config, /FACEBOOK|facebook/i);
  assert.doesNotMatch(accounts, /APP_SECRET|appSecret|client_secret/i);
  assert.doesNotMatch(accounts, /NEXT_PUBLIC_[A-Z_]*FACEBOOK/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
