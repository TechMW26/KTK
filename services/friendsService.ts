import {
  ref,
  get,
  set,
  remove,
  onValue,
  onDisconnect,
  type Database,
  type Unsubscribe,
} from "firebase/database";
import { getRTDatabase } from "@/lib/firebase/database";
import { friendRef, friendsRef, presenceRef } from "@/lib/multiplayer/paths";
import {
  toFriends,
  type Friend,
  type FriendRecord,
  type PresenceRecord,
} from "@/lib/multiplayer/friends";

/**
 * Friends service: the single source of truth for a player's friends list.
 *
 * A friendship is a DIRECTED edge stored at `friends/{uid}/{friendUid}` — you
 * add someone without a consent handshake, so there is nothing to race on and
 * no second copy to keep in sync. Online state is read from `presence/{uid}`,
 * which mirrors the room presence binding: `.info/connected` flips it true and
 * an `onDisconnect` flips it false the instant the socket drops.
 *
 * Like the room/matchmaking services this module only ever talks to Firebase —
 * no UI. All reads/writes are scoped to the caller's own uid (see the RTDB
 * rules), so a player can never read or edit another player's friends list.
 *
 * The list-shaping rules (join + sort + staleness) live in the pure
 * `lib/multiplayer/friends.ts` so they can be unit-tested without Firebase.
 */

export type { Friend, FriendRecord, PresenceRecord } from "@/lib/multiplayer/friends";

function db(): Database {
  const instance = getRTDatabase();
  if (!instance) throw new Error("FIREBASE_NOT_CONFIGURED");
  return instance;
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

/**
 * Publish this player's own presence so friends can see them online.
 *
 * Mirrors `roomService.bindPresence`: mark online now, arm an `onDisconnect`
 * that flips us offline the moment the socket drops, follow `.info/connected`
 * for reconnects, and heartbeat every 20s so a crashed client ages out.
 */
export function bindFriendPresence(
  uid: string,
  name: string,
  opts: { onConnection?: (connected: boolean) => void } = {},
): () => void {
  let database: Database;
  try {
    database = db();
  } catch {
    return () => {};
  }
  const node = presenceRef(database, uid);

  const publish = (online: boolean) => {
    set(node, { name, online, lastSeenAt: Date.now() }).catch(() => {});
  };

  const heartbeat = window.setInterval(() => {
    set(node, { name, online: true, lastSeenAt: Date.now() }).catch(() => {});
  }, 20000);

  const onOnline = () => {
    publish(true);
    opts.onConnection?.(true);
  };
  const onOffline = () => {
    publish(false);
    opts.onConnection?.(false);
  };

  const infoOff = onValue(ref(database, ".info/connected"), (snap) => {
    const connected = snap.val() === true;
    opts.onConnection?.(connected);
    if (connected) {
      onDisconnect(node).set({ name, online: false, lastSeenAt: Date.now() }).catch(() => {});
      publish(true);
    }
  });

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    window.clearInterval(heartbeat);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    infoOff();
    publish(false);
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Add a friend, MUTUALLY and idempotently.
 *
 * One tap makes the two players friends, so `friends/{uid}/{friendUid}` and
 * `friends/{friendUid}/{uid}` are both written. That is what lets the in-game
 * "add friend" affordance disappear for BOTH players at once: each client sees
 * the edge on its own list as soon as the other taps it.
 *
 * A duplicate add is a no-op on the edge itself (a record is only written when
 * it does not exist), so re-adding from a rematch can never create a second
 * entry or move the original `addedAt`. Returns the friend's uid, or null when
 * Firebase is not configured (or the write was rejected).
 */
/**
 * Add a friend.
 *
 * The caller's OWN edge is the one that matters and the one the rules always
 * allow, so it is written first and reported truthfully. Making it mutual is a
 * best-effort second write to the other player's list; when that is rejected the
 * add still succeeds for the player who tapped it.
 *
 * A duplicate add is a no-op on the edge itself (a record is only written when
 * it does not exist), so re-adding from a rematch can never create a second
 * entry or move the original `addedAt`.
 *
 * Returns whether the caller's own edge now exists. It used to return
 * `friend.uid` unconditionally, which reported success even when the write had
 * been denied — the reason a rejected add looked like it had worked.
 */
export async function addFriend(
  uid: string,
  friend: { uid: string; name: string },
  self: { name: string },
): Promise<boolean> {
  if (!uid || !friend.uid || uid === friend.uid) return false;
  const database = db();

  try {
    await ensureFriendEdge(database, uid, friend.uid, friend.name);
  } catch {
    return false;
  }

  // Best-effort mirror. Never awaited as a failure: the caller's edge is already
  // in place, and each client watches its own list, so a rejection here only
  // means the other player must add back themselves.
  try {
    await ensureFriendEdge(database, friend.uid, uid, self.name);
  } catch {
    /* best-effort */
  }

  return true;
}

/**
 * Write `owner`'s edge to `friendUid` if it does not exist yet.
 *
 * Split out so the mutual write is two independent, individually-optional
 * writes: the caller's own record is the field their UI depends on, while the
 * mirror edge is a courtesy to the other player. The two run concurrently and
 * neither failing is fatal to the other.
 *
 * Falls back to a non-empty name. The rules require a string `name`, and an
 * empty one is rejected — which is exactly how the mirror edge failed silently
 * and left "add friend" one-directional, so the fallback is applied here rather
 * than trusted to every caller.
 */
async function ensureFriendEdge(
  database: Database,
  owner: string,
  friendUid: string,
  friendName: string,
): Promise<void> {
  const edge = friendRef(database, owner, friendUid);
  const existing = await get(edge);
  if (existing.exists()) return;
  const record: FriendRecord = {
    uid: friendUid,
    name: String(friendName ?? "").trim().slice(0, 32) || "Player",
    addedAt: Date.now(),
  };
  await set(edge, record);
}

/** Remove a friend edge (own list only). */
export async function removeFriend(uid: string, friendUid: string): Promise<void> {
  await remove(friendRef(db(), uid, friendUid));
}

/** Whether `friendUid` is already on `uid`'s list. */
export async function isFriend(uid: string, friendUid: string): Promise<boolean> {
  const snap = await get(friendRef(db(), uid, friendUid));
  return snap.exists();
}

/**
 * Live watch on ONE friendship edge, so a caller can learn the moment the
 * OTHER player adds them.
 *
 * This is what makes the in-game "add friend" affordance disappear for both
 * players at once: the tap writes both directions, and each client is watching
 * the edge it cannot write itself. Returns an unsubscribe fn; a missing
 * Firebase config or a rejected read reports `false` and keeps watching.
 */
export function watchFriendEdge(
  uid: string,
  friendUid: string,
  onChange: (exists: boolean) => void,
): Unsubscribe {
  let database: Database;
  try {
    database = db();
  } catch {
    onChange(false);
    return () => {};
  }
  return onValue(
    friendRef(database, uid, friendUid),
    (snap) => onChange(snap.exists()),
    () => onChange(false),
  );
}

/**
 * One-shot read of the friends list joined with live presence. Used on mount
 * before the live subscription takes over.
 */
export async function loadFriends(uid: string): Promise<Friend[]> {
  const database = db();
  const [friendsSnap, presenceSnap] = await Promise.all([
    get(friendsRef(database, uid)),
    get(ref(database, "presence")),
  ]);
  const records = (friendsSnap.val() as Record<string, FriendRecord> | null) ?? {};
  const presence = (presenceSnap.val() as Record<string, PresenceRecord> | null) ?? {};
  return toFriends(records, presence);
}

/**
 * Subscribe to the friends list AND to overall presence, so a friend flipping
 * online/offline updates the list without re-reading. Returns an unsubscribe fn.
 */
export function watchFriends(
  uid: string,
  onFriends: (friends: Friend[]) => void,
): Unsubscribe {
  let database: Database;
  try {
    database = db();
  } catch {
    onFriends([]);
    return () => {};
  }

  let records: Record<string, FriendRecord> = {};
  let presence: Record<string, PresenceRecord> = {};

  const emit = () => onFriends(toFriends(records, presence));

  const offFriends = onValue(friendsRef(database, uid), (snap) => {
    records = (snap.val() as Record<string, FriendRecord> | null) ?? {};
    emit();
  });
  const offPresence = onValue(ref(database, "presence"), (snap) => {
    presence = (snap.val() as Record<string, PresenceRecord> | null) ?? {};
    emit();
  });

  return () => {
    offFriends();
    offPresence();
  };
}
