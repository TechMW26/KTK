/**
 * Pure friends-list shaping.
 *
 * Kept free of Firebase (and of the `@/` path alias) so it can be unit-tested
 * with plain Node, exactly like `lib/game/rules.ts` — the social rules are the
 * part worth pinning, not the RTDB plumbing around them.
 *
 * A friendship is a DIRECTED edge `friends/{uid}/{friendUid}`; online state
 * comes from the separate `presence/{uid}` node. This module joins the two.
 */

/** One entry on the friends list, as returned to the UI. */
export interface Friend {
  uid: string;
  name: string;
  addedAt: number;
  /** Live presence; false when the friend has never been seen or is offline. */
  online: boolean;
  /** ms epoch of the friend's last presence heartbeat, 0 when unknown. */
  lastSeenAt: number;
}

/** A raw `friends/{uid}/{friendUid}` record. */
export interface FriendRecord {
  uid: string;
  name: string;
  addedAt: number;
  lastSeenAt?: number;
}

/** A raw `presence/{uid}` record. */
export interface PresenceRecord {
  name?: string;
  online?: boolean;
  lastSeenAt?: number;
}

/**
 * The longest a presence heartbeat may age before we treat the player offline.
 * Comfortably above the 20s heartbeat interval so a single dropped beat does not
 * flicker the list, but short enough that a crashed client stops showing as
 * online within a minute.
 */
export const PRESENCE_STALE_MS = 55 * 1000;

/** True when a presence record is recent enough to count as online. */
export function isOnline(presence: PresenceRecord | null): boolean {
  if (!presence?.online) return false;
  const seen = Number(presence.lastSeenAt ?? 0);
  if (!seen) return true; // online flag set but no clock yet: trust the flag
  return Date.now() - seen < PRESENCE_STALE_MS;
}

/** Join raw friend records with a presence map into a sorted, UI-ready list. */
export function toFriends(
  records: Record<string, FriendRecord>,
  presence: Record<string, PresenceRecord>,
): Friend[] {
  return Object.values(records)
    .filter((record): record is FriendRecord => Boolean(record?.uid))
    .map((record) => {
      const live = presence[record.uid] ?? null;
      return {
        uid: record.uid,
        name: record.name || live?.name || "Player",
        addedAt: record.addedAt ?? 0,
        online: isOnline(live),
        lastSeenAt: Number(live?.lastSeenAt ?? 0),
      };
    })
    // Online first, then most recently added, then by name for a stable order.
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (a.addedAt !== b.addedAt) return b.addedAt - a.addedAt;
      return a.name.localeCompare(b.name);
    });
}
