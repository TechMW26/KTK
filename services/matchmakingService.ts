import {
  get,
  onValue,
  set,
  remove,
  update,
  runTransaction,
  type Database,
  type DataSnapshot,
  type Unsubscribe,
} from "firebase/database";
import { getRTDatabase } from "@/lib/firebase/database";
import {
  matchmakingRef,
  matchmakingAllRef,
  matchmakingHostRef,
  matchmakingHostAllRef,
} from "@/lib/multiplayer/paths";
import { createRoom } from "@/services/roomService";
import {
  MATCHMAKING_STALE_MS,
  type MatchmakingEntry,
  type MatchmakingHostEntry,
  type MatchSettings,
} from "@/lib/multiplayer/types";

/**
 * "Search Online Players" matchmaking service.
 *
 * Pairing model (self-ownership only, so the RTDB rules stay tight):
 *  - Every searcher writes ONLY its own `matchmaking/{uid}` node ({"searching"}).
 *  - To avoid two players matching each other at once, the LEXICONGRAPHICALLY
 *    SMALLER uid is the designated HOST of a pair. The host creates a real room,
 *    then records the invitation on its own `matchmakingHost/{uid}` node
 *    ({ status:"inviting", roomCode, invitedUid }). The invitee reads that node
 *    (read-allowed) and joins the normal room via the existing joinRoom path.
 *  - Same player can never match itself (we only consider other uids).
 *  - Stale entries (crashed clients) are ignored via age-based filtering and by
 *    an onDisconnect cleanup that removes the search entry.
 *
 * All writes target the caller's own uid so no cross-player write permission is
 * required. This intentionally mirrors the existing "friends-only, code-shared"
 * trust model documented in docs/FIREBASE_MULTIPLAYER.md.
 */

function db(): Database {
  const instance = getRTDatabase();
  if (!instance) throw new Error("FIREBASE_NOT_CONFIGURED");
  return instance;
}

const fresh = (updatedAt: number | undefined): boolean =>
  typeof updatedAt !== "number" || Date.now() - updatedAt < MATCHMAKING_STALE_MS;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Start announcing we are searching for an opponent. */
export async function announceSearch(uid: string, name: string): Promise<boolean> {
  const database = db();
  const node = matchmakingRef(database, uid);
  const now = Date.now();
  const entry: MatchmakingEntry = {
    name: name.trim() || "Player",
    status: "searching",
    joinedAt: now,
    updatedAt: now,
  };
  try {
    await set(node, entry);
    // If this client drops, remove the search entry so we never linger as a ghost.
    const { onDisconnect } = await import("firebase/database");
    try {
      onDisconnect(node).remove();
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}

/** Stop searching (cancel). Removes own search node. */
export async function cancelSearch(uid: string): Promise<void> {
  const database = db();
  try {
    await remove(matchmakingRef(database, uid));
  } catch {
    /* ignore */
  }
}

/**
 * Create a room and, if we are the designated host of a pair, atomically claim the
 * hosting slot with the invite. Returns the room code on success or null.
 */
export async function hostPair(
  uid: string,
  myName: string,
  invitedUid: string,
  invitedName: string,
  settings: MatchSettings,
): Promise<string | null> {
  const database = db();
  const hostNode = matchmakingHostRef(database, uid);
  const now = Date.now();

  // 1) Try to claim the hosting slot first (dedupe). Only proceeds if we aren't
  //    already hosting or matched.
  try {
    const claim = await runTransaction(
      hostNode,
      (raw) => {
        const cur = (raw as MatchmakingHostEntry | null) ?? null;
        if (cur && (cur.status === "inviting" || cur.status === "matched")) {
          return undefined; // already claimed elsewhere
        }
        const name = myName.trim() || "Player";
        const entry: MatchmakingHostEntry = {
          name,
          status: "inviting",
          joinedAt: now,
          updatedAt: now,
          invitedUid,
        };
        return entry;
      },
      { applyLocally: false },
    );
    if (!claim.committed) return null;
  } catch {
    return null;
  }

  // 2) Building the actual room is best-effort + collision-retried inside createRoom.
  const res = await createRoom(uid, myName, settings).catch(() => ({ ok: false as const, reason: "ERROR" }));
  if (!res.ok) {
    // roll back the host claim so another player may try
    try {
      await remove(hostNode);
    } catch {
      /* ignore */
    }
    return null;
  }

  // 3) Publish the room code under our own host node, then stop advertising self
  //    as a "searching" candidate.
  try {
    await update(hostNode, {
      status: "inviting",
      updatedAt: Date.now(),
      roomCode: res.code,
      invitedUid,
    });
    await update(matchmakingRef(database, uid), { status: "matched", updatedAt: Date.now() });
  } catch {
    /* ignore */
  }
  void invitedName;
  return res.code;
}

/** A guest that has been invited clears their own search advertisement. */
export async function acceptInvite(uid: string): Promise<void> {
  const database = db();
  try {
    await update(matchmakingRef(database, uid), { status: "matched", updatedAt: Date.now() });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Observing the pool
// ---------------------------------------------------------------------------

export interface SearchCandidate {
  /** A "searching" player (not self) this uid could invite (as host). */
  others: { uid: string; name: string; joinedAt: number }[];
  /** A host invitation aimed at this uid (as guest) to join. */
  forMe: { hostUid: string; roomCode?: string } | null;
}

/** Watch all searching players + host invitations and derive candidates. */
export function watchPool(
  uid: string,
  cb: (c: SearchCandidate) => void,
): Unsubscribe {
  const database = db();
  const offSelfHost = onValue(matchmakingHostRef(database, uid), () => {
    /* keep self host node warm for re-render */
  });

  let others: { uid: string; name: string; joinedAt: number }[] = [];
  let forMe: { hostUid: string; roomCode?: string } | null = null;

  const push = () => cb({ others, forMe });

  const offAll = onValue(matchmakingAllRef(database), (snap: DataSnapshot) => {
    const all = (snap.val() as Record<string, MatchmakingEntry> | null) ?? {};
    others = Object.entries(all)
      .filter(([u, e]) => u !== uid && e?.status === "searching" && fresh(e.updatedAt))
      .map(([u, e]) => ({ uid: u, name: e.name, joinedAt: e.joinedAt }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
    push();
  });

  const offHosts = onValue(matchmakingHostAllRef(database), (snap: DataSnapshot) => {
    const all = (snap.val() as Record<string, MatchmakingHostEntry> | null) ?? {};
    const mine = Object.entries(all).find(
      ([, e]) => e?.status === "inviting" && e.invitedUid === uid && !!e.roomCode,
    );
    forMe = mine ? { hostUid: mine[0], roomCode: mine[1].roomCode } : null;
    push();
  });

  return () => {
    offSelfHost();
    offAll();
    offHosts();
  };
}

/** Convenience: list everyone currently searching (excluding uid). */
export async function listSearchers(uid: string): Promise<{ uid: string; name: string }[]> {
  const database = db();
  const snap = await get(matchmakingAllRef(database));
  const all = (snap.val() as Record<string, MatchmakingEntry> | null) ?? {};
  return Object.entries(all)
    .filter(([u, e]) => u !== uid && e?.status === "searching" && fresh(e.updatedAt))
    .map(([u, e]) => ({ uid: u, name: e.name }));
}

/** Read an incoming guest-facing host invitation for this uid, if any. */
export async function readInviteFor(uid: string): Promise<{ hostUid: string; roomCode: string } | null> {
  const database = db();
  const snap = await get(matchmakingHostAllRef(database));
  const all = (snap.val() as Record<string, MatchmakingHostEntry> | null) ?? {};
  const mine = Object.entries(all).find(
    ([, e]) => e?.status === "inviting" && e.invitedUid === uid && !!e.roomCode,
  );
  return mine ? { hostUid: mine[0], roomCode: mine[1].roomCode! } : null;
}
