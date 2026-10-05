import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  linkWithCredential,
  linkWithRedirect,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile as updateAuthProfile,
  type Auth,
  type User,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseAuth } from "./auth";
import { ensureProfile, providerIds, updateProfile, type UserProfile } from "./profile";

/**
 * Account sign-in / upgrade layer.
 *
 * Two rules govern everything here:
 *
 * 1. UPGRADE, NEVER REPLACE. A guest is upgraded with `linkWithCredential`, which
 *    KEEPS the existing anonymous uid. Calling a plain `signIn*` would mint a new
 *    uid and orphan the player's `secrets/{uid}` nodes and room entries. See
 *    docs/ACCOUNTS_DESIGN.md §2.
 * 2. NO SILENT MERGING. If a credential already belongs to another account we
 *    surface `credential-in-use` and let the player choose; we never fuse two
 *    accounts automatically.
 */

/** Machine-readable outcome so the UI can map to copy without parsing messages. */
export type AuthOutcome =
  | { ok: true; user: User; profile: UserProfile | null }
  | { ok: false; reason: AuthFailureReason };

export type AuthFailureReason =
  | "not-configured"
  | "provider-disabled"
  | "invalid-email"
  | "wrong-credentials"
  | "email-in-use"
  | "weak-password"
  | "too-many-requests"
  | "network"
  | "credential-in-use"
  | "popup-cancelled"
  | "popup-blocked"
  | "timeout"
  | "unknown";

/** Map a raw Firebase error code to a reason the UI can render copy for. */
function reasonFor(code: string): AuthFailureReason {
  switch (code) {
    case "auth/operation-not-allowed":
    case "auth/admin-restricted-operation":
      return "provider-disabled";
    case "auth/invalid-email":
      return "invalid-email";
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/user-not-found":
      return "wrong-credentials";
    case "auth/email-already-in-use":
      return "email-in-use";
    case "auth/weak-password":
      return "weak-password";
    case "auth/too-many-requests":
      return "too-many-requests";
    case "auth/network-request-failed":
      return "network";
    case "auth/credential-already-in-use":
    case "auth/account-exists-with-different-credential":
      return "credential-in-use";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "popup-cancelled";
    case "auth/popup-blocked":
    case "auth/operation-not-supported-in-this-environment":
    case "auth/web-storage-unsupported":
      return "popup-blocked";
    default:
      return "unknown";
  }
}

function codeOf(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

function authOrFail(): Auth | { ok: false; reason: AuthFailureReason } {
  const auth = getFirebaseAuth();
  if (!auth) return { ok: false, reason: "not-configured" };
  return auth;
}

/** Finish an upgrade: sync identity fields and guarantee the profile exists. */
async function completeUpgrade(user: User): Promise<AuthOutcome> {
  const profile = await ensureProfile(user);
  return { ok: true, user, profile };
}

/** Whether the current session is an anonymous guest. */
export function isGuest(user: User | null): boolean {
  return user ? user.isAnonymous : true;
}

/**
 * Upgrade the current guest to an email/password account, preserving the uid.
 * If no session exists yet, falls back to creating a fresh account.
 */
export async function upgradeWithEmail(
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const auth = authOrFail();
  if ("ok" in auth) return auth;

  try {
    const current = auth.currentUser;
    if (current && current.isAnonymous) {
      const credential = EmailAuthProvider.credential(email, password);
      const result: UserCredential = await linkWithCredential(current, credential);
      await sendEmailVerification(result.user).catch(() => {});
      return completeUpgrade(result.user);
    }
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(result.user).catch(() => {});
    return completeUpgrade(result.user);
  } catch (error) {
    return { ok: false, reason: reasonFor(codeOf(error)) };
  }
}

/**
 * Start Google sign-in.
 *
 * REDIRECT, NOT POPUP. The popup flow depends on `window.open` and a
 * cross-origin postMessage handshake, which browsers block outright in the
 * Capacitor WebView and in many embedded contexts. The popup variant was
 * confirmed to hang indefinitely there with no rejection, leaving the UI stuck.
 *
 * `linkWithRedirect` / `signInWithRedirect` navigate away instead, so there is
 * no popup to block. This function therefore never returns a signed-in user:
 * the page unloads and the result is collected by `completeRedirectSignIn()`
 * when the player comes back.
 */
export async function startGoogleSignIn(): Promise<AuthOutcome> {
  const auth = authOrFail();
  if ("ok" in auth) return auth;

  try {
    const provider = new GoogleAuthProvider();
    const current = auth.currentUser;
    // Linking keeps the guest uid, so pre-existing data is preserved.
    if (current && current.isAnonymous) {
      await linkWithRedirect(current, provider);
    } else {
      await signInWithRedirect(auth, provider);
    }
    // Unreachable in practice: the browser is already navigating away.
    return { ok: true, user: current as User, profile: null };
  } catch (error) {
    return { ok: false, reason: reasonFor(codeOf(error)) };
  }
}

/**
 * Collect the result of a redirect sign-in after the page reloads.
 *
 * Safe to call on every load: it resolves to null when there is no pending
 * redirect, which is the normal case. A `credential-already-in-use` here means
 * the Google account already has a profile, and we surface that rather than
 * silently merging — see the module note above.
 */
export async function completeRedirectSignIn(): Promise<AuthOutcome | null> {
  const auth = authOrFail();
  if ("ok" in auth) return auth;

  try {
    const result = await getRedirectResult(auth);
    if (!result) return null;
    return completeUpgrade(result.user);
  } catch (error) {
    return { ok: false, reason: reasonFor(codeOf(error)) };
  }
}

/**
 * Start Apple sign-in.
 *
 * Redirect for the same reason as Google. CODE-COMPLETE BUT UNVERIFIED: Apple
 * requires a Service ID, Team ID, Key ID and private key, none of which are
 * configured, so this has never completed successfully.
 */
export async function startAppleSignIn(): Promise<AuthOutcome> {
  const auth = authOrFail();
  if ("ok" in auth) return auth;

  try {
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    const current = auth.currentUser;
    if (current && current.isAnonymous) {
      await linkWithRedirect(current, provider);
    } else {
      await signInWithRedirect(auth, provider);
    }
    return { ok: true, user: current as User, profile: null };
  } catch (error) {
    return { ok: false, reason: reasonFor(codeOf(error)) };
  }
}

/** Sign an existing account in directly (no upgrade). Changes the uid. */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const auth = authOrFail();
  if ("ok" in auth) return auth;

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return completeUpgrade(result.user);
  } catch (error) {
    return { ok: false, reason: reasonFor(codeOf(error)) };
  }
}

/** Send a password-reset email. Never reveals whether the address exists. */
export async function requestPasswordReset(email: string): Promise<AuthOutcome> {
  const auth = authOrFail();
  if ("ok" in auth) return auth;

  try {
    await sendPasswordResetEmail(auth, email);
    return { ok: true, user: auth.currentUser as User, profile: null };
  } catch (error) {
    const reason = reasonFor(codeOf(error));
    // Treat "no such user" as success so the screen cannot be used to probe
    // which email addresses have accounts.
    if (reason === "wrong-credentials") {
      return { ok: true, user: auth.currentUser as User, profile: null };
    }
    return { ok: false, reason };
  }
}

/** Re-send the verification email for the current account. */
export async function resendVerificationEmail(): Promise<AuthOutcome> {
  const auth = authOrFail();
  if ("ok" in auth) return auth;
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "not-configured" };
  try {
    await sendEmailVerification(user);
    return { ok: true, user, profile: null };
  } catch (error) {
    return { ok: false, reason: reasonFor(codeOf(error)) };
  }
}

/** Change the account display name in both Firebase Auth and the profile. */
export async function setAccountDisplayName(
  user: User,
  displayName: string,
): Promise<void> {
  await updateAuthProfile(user, { displayName });
  await updateProfile(user.uid, { displayName });
}

/** The provider ids linked to the current account, for the account screen. */
export function linkedProviders(user: User | null): string[] {
  return user ? providerIds(user) : [];
}
