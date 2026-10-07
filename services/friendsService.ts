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
 * Add a friend, idempotently.
 *
 * A duplicate add is a no-op on the edge itself (the name/timestamp are only
 * written if the edge does not exist), so re-adding from a rematch can never
 * create a second entry or move the original `addedAt`. Returns the friend's
 * uid, or null when Firebase is not configured.
 */
export async function addFriend(
  uid: string,
  friend: { uid: string; name: string },
): Promise<string | null> {
  if (!uid || !friend.uid || uid === friend.uid) return null;
  const database = db();
  const edge = friendRef(database, uid, friend.uid);
  const existing = await get(edge);
  if (existing.exists()) return friend.uid;
  const record: FriendRecord = {
    uid: friend.uid,
    name: friend.name.slice(0, 32) || "Player",
    addedAt: Date.now(),
  };
  await set(edge, record);
  return friend.uid;
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
