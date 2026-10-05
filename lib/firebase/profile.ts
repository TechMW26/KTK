import {
  ref,
  get,
  set,
  update,
  serverTimestamp,
  type Database,
} from "firebase/database";
import type { User } from "firebase/auth";
import { getRTDatabase } from "./database";

/**
 * The account profile node, `users/{uid}`.
 *
 * Accounts are ADDITIVE: the game still plays fine as an anonymous guest, so
 * nothing here is required for existing flows. This module only owns the
 * durable profile that currency, stats and social features will later attach
 * to — which is why it must live on a uid that survives an app reinstall.
 *
 * Only the owning player may read or write their node (see
 * `firebase/database.rules.json`), so no cross-player reads are possible here.
 */

export interface UserProfile {
  /** Display name. Replaces the per-session name on the home screen. */
  displayName: string;
  /** ms epoch when the profile was first created. */
  createdAt: number;
  /** ms epoch of the last profile write. */
  updatedAt: number;
  /** Linked sign-in providers, e.g. ["password", "google.com", "apple.com"]. */
  providers: string[];
  /** Mirrors the Firebase user record; gates currency, never gameplay. */
  emailVerified: boolean;
  /** Soft delete marker: null while active, ms epoch once deleted. */
  deletedAt: number | null;
}

/** Longest display name allowed by the rules; keep the UI in step with it. */
export const MAX_DISPLAY_NAME_LENGTH = 24;

/** Only these fields may be written from the client for `users/{uid}`. */
type ProfilePatch = Partial<
  Pick<UserProfile, "displayName" | "providers" | "emailVerified" | "deletedAt">
>;

function profileRef(db: Database, uid: string) {
  return ref(db, `users/${uid}`);
}

/** The provider ids currently linked to a Firebase user. */
export function providerIds(user: User): string[] {
  return user.providerData
    .map((entry) => entry.providerId)
    .filter((id): id is string => Boolean(id));
}

/** True when the account may hold currency (see docs/ACCOUNTS_DESIGN.md §3.6). */
export function mayHoldCurrency(user: User | null, profile: UserProfile | null): boolean {
  if (!user || !profile || profile.deletedAt !== null) return false;
  // Google/Apple arrive already verified; only the password path needs the gate.
  return profile.providers.includes("password") ? profile.emailVerified : true;
}

/**
 * Read the profile for the signed-in user, or null when it does not exist yet.
 * Returns null (rather than throwing) when Firebase is unconfigured, so callers
 * can treat "no backend" and "no profile" the same way.
 */
export async function loadProfile(uid: string): Promise<UserProfile | null> {
  const db = getRTDatabase();
  if (!db) return null;
  const snap = await get(profileRef(db, uid));
  return (snap.val() as UserProfile | null) ?? null;
}

/**
 * Create the profile on first sign-in. Idempotent: an existing profile is left
 * completely untouched so a returning player keeps their createdAt/displayName.
 * Returns the profile that is now stored.
 */
export async function ensureProfile(user: User): Promise<UserProfile | null> {
  const db = getRTDatabase();
  if (!db) return null;

  const existing = await loadProfile(user.uid);
  if (existing) return existing;

  const displayName = (user.displayName ?? "").slice(0, MAX_DISPLAY_NAME_LENGTH);
  // `providers` must never be empty. On a fresh sign-up Firebase Auth can report
  // an empty providerData for a moment, and the rules require the field to have
  // at least one child — an empty array makes the whole set() fail validation,
  // which silently drops every field in the write.
  const providers = providerIds(user);
  await set(profileRef(db, user.uid), {
    displayName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    providers: providers.length > 0 ? providers : ["anonymous"],
    emailVerified: user.emailVerified,
    deletedAt: null,
  });
  return loadProfile(user.uid);
}

/**
 * Patch the caller's own profile. Only allow-listed fields are ever written, so
 * a caller cannot smuggle `createdAt` or future currency fields through here.
 */
export async function updateProfile(uid: string, patch: ProfilePatch): Promise<void> {
  const db = getRTDatabase();
  if (!db) return;

  const clean: Record<string, unknown> = {};
  if (patch.displayName !== undefined) {
    clean.displayName = patch.displayName.slice(0, MAX_DISPLAY_NAME_LENGTH);
  }
  if (patch.providers !== undefined) clean.providers = patch.providers;
  if (patch.emailVerified !== undefined) clean.emailVerified = patch.emailVerified;
  if (patch.deletedAt !== undefined) clean.deletedAt = patch.deletedAt;

  if (Object.keys(clean).length === 0) return;
  clean.updatedAt = serverTimestamp();
  await update(profileRef(db, uid), clean);
}

/**
 * Re-sync fields that the identity provider owns rather than the player: the
 * linked providers and whether the address is verified (which changes when the
 * player clicks the verification link, outside our UI).
 */
export async function syncIdentityFields(user: User): Promise<UserProfile | null> {
  const profile = await loadProfile(user.uid);
  if (!profile) return null;

  const providers = providerIds(user);
  // A profile written before `providers` existed, or one whose write partially
  // failed, has no array here. Reading `.length` on it threw and took the whole
  // account hook down, leaving the screen showing no profile at all.
  const known = Array.isArray(profile.providers) ? profile.providers : [];
  const providersChanged =
    providers.length !== known.length || providers.some((id) => !known.includes(id));

  if (providersChanged || user.emailVerified !== profile.emailVerified) {
    await updateProfile(user.uid, { providers, emailVerified: user.emailVerified });
    return loadProfile(user.uid);
  }
  return profile;
}

/**
 * Soft delete (docs/ACCOUNTS_DESIGN.md §5.4): mark the node and let a future
 * scheduled purge remove it after a grace period, so an accidental delete is
 * recoverable. A hard delete is deliberately NOT exposed to the client.
 */
export async function softDeleteProfile(uid: string): Promise<void> {
  await updateProfile(uid, { deletedAt: Date.now() });
}
