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
import { COUNTRY_CODES } from "../profile/countries";
import { isValidDateOfBirth } from "../profile/dates";

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
  /** Player's own name for the profile screen. */
  name: string;
  /** ISO 3166-1 alpha-2 code, "" when unset. Free text would break the picker. */
  country: string;
  /** Birthday as "YYYY-MM-DD", "" when unset. A string, not a Date: it is a
   *  calendar date, and a Date would shift it across timezones on read. */
  dateOfBirth: string;
  /** Completed matches. Written ONLY by the game loop, never by the profile UI. */
  matchesPlayed: number;
  /** Completed matches the player won. Same ownership rule as matchesPlayed. */
  matchesWon: number;
}

/** Longest display name allowed by the rules; keep the UI in step with it. */
export const MAX_DISPLAY_NAME_LENGTH = 24;

/** Longest profile name allowed by the rules. */
export const MAX_NAME_LENGTH = 32;

/**
 * Only these fields may be written from the client for `users/{uid}`.
 *
 * The statistics are deliberately ABSENT. They are written through
 * `recordMatchResult`, which derives the delta from the game's own outcome, so
 * there is no code path that lets a caller set a win count directly. If they
 * were in this union, the profile screen could smuggle in any number it liked.
 */
type ProfilePatch = Partial<
  Pick<UserProfile, "displayName" | "providers" | "emailVerified" | "deletedAt">
>;

/** The editable part of a profile — everything the Account screen owns. */
export interface ProfileDetails {
  name: string;
  country: string;
  dateOfBirth: string;
}

function profileRef(db: Database, uid: string) {
  return ref(db, `users/${uid}`);
}

/**
 * Fill in anything a profile node predates.
 *
 * Nodes written before this screen existed have no name/country/dateOfBirth and
 * no statistics. Reading them as `undefined` would render "undefined%" and
 * `NaN%` on the ratio, so every read is normalised through here instead of the
 * UI defending against each missing field separately.
 */
function normaliseProfile(raw: Partial<UserProfile> | null): UserProfile | null {
  if (!raw) return null;
  return {
    displayName: typeof raw.displayName === "string" ? raw.displayName : "",
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
    providers: Array.isArray(raw.providers) ? raw.providers : [],
    emailVerified: raw.emailVerified === true,
    deletedAt: typeof raw.deletedAt === "number" ? raw.deletedAt : null,
    name: typeof raw.name === "string" ? raw.name : "",
    country: typeof raw.country === "string" ? raw.country : "",
    dateOfBirth: typeof raw.dateOfBirth === "string" ? raw.dateOfBirth : "",
    matchesPlayed: typeof raw.matchesPlayed === "number" ? raw.matchesPlayed : 0,
    matchesWon: typeof raw.matchesWon === "number" ? raw.matchesWon : 0,
  };
}

/**
 * Win rate as a percentage, one decimal place.
 *
 * Zero matches is 0%, not NaN: dividing by zero here would put "NaN%" on the
 * screen for every new player, which is exactly the state they start in.
 */
export function winningRatio(profile: Pick<UserProfile, "matchesPlayed" | "matchesWon">): string {
  if (profile.matchesPlayed <= 0) return "0%";
  const ratio = (profile.matchesWon / profile.matchesPlayed) * 100;
  // Trim a pointless ".0" so 100% and 50% read cleanly while 64.29 stays 64.3.
  return `${Number(ratio.toFixed(1))}%`;
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
  return normaliseProfile(snap.val() as Partial<UserProfile> | null);
}

/**
 * Create the profile on first sign-in. Idempotent: an existing profile is left
 * completely untouched so a returning player keeps their createdAt/displayName.
 * Returns the profile that is now stored.
 *
 * Anonymous guests return null without writing. Guests are never persisted, so
 * no caller can create a `users/{uid}` node for one by accident; a real account
 * gets its profile when the guest later links a provider (uid is preserved,
 * see `upgradeWithEmail`).
 */
export async function ensureProfile(user: User): Promise<UserProfile | null> {
  const db = getRTDatabase();
  if (!db) return null;
  if (user.isAnonymous) return null;

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
    // The provider-supplied name seeds the profile so the field is not blank on
    // first open; the player can overwrite it. Stats start at zero and are the
    // game loop's to increment.
    name: displayName,
    country: "",
    dateOfBirth: "",
    matchesPlayed: 0,
    matchesWon: 0,
  });
  return loadProfile(user.uid);
}

/**
 * Save the editable profile fields.
 *
 * Returns the validation error to show, or null on success. Validation lives
 * here rather than in the component so the rules and the UI cannot drift apart,
 * and so a bad date can never reach the database.
 *
 * `displayName` is updated in step with `name`: the home screen still reads
 * displayName, and having the account screen change the name while the home
 * screen kept showing the old one would be a visible contradiction.
 */
export async function saveProfileDetails(
  uid: string,
  details: ProfileDetails,
): Promise<string | null> {
  const db = getRTDatabase();
  if (!db) return "Not connected. Check your internet connection and try again.";

  const name = details.name.trim();
  const country = details.country.trim();
  const dateOfBirth = details.dateOfBirth.trim();

  if (!name) return "Enter your name.";
  if (name.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  if (country && !COUNTRY_CODES.has(country)) return "Choose a country from the list.";
  if (dateOfBirth && !isValidDateOfBirth(dateOfBirth)) {
    return "Enter a valid date of birth in the past.";
  }

  await update(profileRef(db, uid), {
    name,
    displayName: name.slice(0, MAX_DISPLAY_NAME_LENGTH),
    country,
    dateOfBirth,
    updatedAt: serverTimestamp(),
  });
  return null;
}

/**
 * Record one completed match against the account.
 *
 * This is the ONLY writer of `matchesPlayed`/`matchesWon`, which is what keeps
 * the statistics honest: the counters are derived from the game's own outcome
 * and there is no UI that accepts a number. The read-modify-write is
 * deliberately not a transaction — a lost increment from a concurrent update is
 * an acceptable trade for not adding a round trip on the match-end path, and a
 * player only ever finishes one match at a time on one device.
 *
 * Best-effort by design: a stats write must never break the match-end screen, so
 * callers get the failure back rather than an exception.
 */
export async function recordMatchResult(
  uid: string,
  won: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getRTDatabase();
  if (!db) return { ok: false, reason: "not-configured" };

  try {
    const profile = await loadProfile(uid);
    if (!profile || profile.deletedAt !== null) return { ok: false, reason: "no-profile" };

    await update(profileRef(db, uid), {
      matchesPlayed: profile.matchesPlayed + 1,
      matchesWon: profile.matchesWon + (won ? 1 : 0),
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "write-failed" };
  }
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
