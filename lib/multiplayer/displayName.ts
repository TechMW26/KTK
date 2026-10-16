/**
 * Online display names.
 *
 * Typing a name before an online game is OPTIONAL. A player who skips it still
 * plays, and their opponent sees UNKNOWN_PLAYER instead of the old "Player 1" /
 * "Player 2" / "Player", which made people think they were looking at a bug.
 *
 * Kept free of React and Firebase so the services and the screens can share it.
 */

/** What the opponent sees when a player did not type a name. */
export const UNKNOWN_PLAYER = "Unknown Player";

/** Longest name we store (the friends rules allow 32; 20 fits the score strip). */
export const NAME_MAX = 20;

const STORAGE_KEY = "ktk:onlineName";

/** Collapse spaces, trim, and cap the length. Returns "" for an empty name. */
export function cleanName(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

/** The name to write to the room / matchmaking pool: typed name or UNKNOWN_PLAYER. */
export function nameOrUnknown(raw: string | null | undefined): string {
  return cleanName(raw) || UNKNOWN_PLAYER;
}

/** The last name this device used online, so the player does not retype it. */
export function loadSavedName(): string {
  try {
    return cleanName(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "";
  }
}

/** Remember the typed name for next time (an empty name is not saved). */
export function saveName(raw: string): void {
  const name = cleanName(raw);
  if (!name) return;
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* storage blocked (private mode): just don't remember it */
  }
}