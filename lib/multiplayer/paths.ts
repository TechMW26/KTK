import {
  ref,
  type Database,
  type DatabaseReference,
} from "firebase/database";

/**
 * Centrally defines every RTDB path so UI/services never scatter raw path
 * strings. Keeping the shape here makes the Security Rules easier to reason
 * about and to keep in sync.
 *
 * Top-level layout:
 *   rooms/{code}
 *     - hostId, code, status, createdAt, updatedAt
 *     - order:  [p0Uid, p1Uid]
 *     - players/{uid}: { name, joinedAt, connected, seat, isHost, presence }
 *     - game: { status, level, round, scores, bluffsUsed, phase, actingSeat,
 *               dealerSeat, awaitingNext, lastResult, winnerSeat, roundToken }
 *     - secrets/{uid}: the seat's PRIVATE per-round { kingIndex, isBluff, ... }
 */

export function roomRef(db: Database, code: string): DatabaseReference {
  return ref(db, `rooms/${code}`);
}

export function gameRef(db: Database, code: string): DatabaseReference {
  return ref(db, `rooms/${code}/game`);
}

export function playersRef(db: Database, code: string): DatabaseReference {
  return ref(db, `rooms/${code}/players`);
}

export function playerRef(db: Database, code: string, uid: string): DatabaseReference {
  return ref(db, `rooms/${code}/players/${uid}`);
}

export function orderRef(db: Database, code: string): DatabaseReference {
  return ref(db, `rooms/${code}/order`);
}

export function secretRef(db: Database, code: string, uid: string): DatabaseReference {
  return ref(db, `rooms/${code}/secrets/${uid}`);
}

/** Reference to a single seat private secret key (rooms/{c}/secrets/{uid}/{k}). */
export function secretChildRef(db: Database, code: string, uid: string, key: string): DatabaseReference {
  return ref(db, `rooms/${code}/secrets/${uid}/${key}`);
}

// ---------------------------------------------------------------------------
// Matchmaking ("Search Online Players")
// Layout:
//   matchmaking/{uid}: { name, joinedAt, status, updatedAt, invitedBy? }
//     - status: "searching" | "inviting" | "matched" | "cancelled"
//     - invitedBy: uid of the player who invited this player into a room
//   matchmakingHost/{uid}: { name, joinedAt, status, updatedAt, roomCode?, invitedUid? }
//     The player who first pairs up becomes a "host" invitation: they create the
//     room and leave the code under their own host node for the invitee to read.
// ---------------------------------------------------------------------------

/** Live "I am searching" entry (self-owned). */
export function matchmakingRef(db: Database, uid: string): DatabaseReference {
  return ref(db, `matchmaking/${uid}`);
}

/** Snapshot of every searching player's own node. */
export function matchmakingAllRef(db: Database): DatabaseReference {
  return ref(db, "matchmaking");
}

/** The host invitation node (also self-owned). */
export function matchmakingHostRef(db: Database, uid: string): DatabaseReference {
  return ref(db, `matchmakingHost/${uid}`);
}

/** Every host invitation in flight. */
export function matchmakingHostAllRef(db: Database): DatabaseReference {
  return ref(db, "matchmakingHost");
}

// ---------------------------------------------------------------------------
// Atomic pair claims ("Search Online Players" race fix)
// Layout:
//   matchmakingPairs/{pairKey}: { hostUid, invitedUid, claimedAt, ... }
//     pairKey = [uidA, uidB].sort().join("_"). A runTransaction on this SINGLE
//     shared node is the one true "who is host" lock: only the transaction that
//     commits first creates it; every later txn re-runs, sees it exists and yields
//     the SAME hostUid. Guests never create a duplicate pair or duplicate room.
// ---------------------------------------------------------------------------

/** Reference to the whole pair-claim index. */
export function matchmakingPairsAllRef(db: Database): DatabaseReference {
  return ref(db, "matchmakingPairs");
}

/** Reference to the atomic claim for ONE pair (sorted pairKey). */
export function pairClaimRef(db: Database, uidA: string, uidB: string): DatabaseReference {
  const pairKey = [uidA, uidB].sort().join("_");
  return ref(db, `matchmakingPairs/${pairKey}`);
}

/** Pair claim child reference from a precomputed sorted pairKey. */
export function pairClaimByKeyRef(db: Database, pairKey: string): DatabaseReference {
  return ref(db, `matchmakingPairs/${pairKey}`);
}

// ---------------------------------------------------------------------------
// Friends
// Layout:
//   friends/{uid}/{friendUid}: { uid, name, addedAt, lastSeenAt }
//     - Owned by `uid`; the single source of truth for who is on that player's
//       friends list. A friendship is stored as a DIRECTED edge (you add someone
//       without needing their consent, like a "following" list), so there is no
//       mutual-matchmaking handshake to race on. Presence/online state is read
//       from `presence/{uid}` and is never duplicated here.
// ---------------------------------------------------------------------------

/** A player's whole friends map (own node). */
export function friendsRef(db: Database, uid: string): DatabaseReference {
  return ref(db, `friends/${uid}`);
}

/** One friendship edge (own node). */
export function friendRef(db: Database, uid: string, friendUid: string): DatabaseReference {
  return ref(db, `friends/${uid}/${friendUid}`);
}

/**
 * Lightweight presence node, `presence/{uid}: { name, online, lastSeenAt }`.
 *
 * Kept separate from `rooms`/`matchmaking` so the friends list can show who is
 * online without subscribing to every room. `online` is driven by a
 * `.info/connected` binding (see bindPresence-style usage in friendsService).
 */
export function presenceRef(db: Database, uid: string): DatabaseReference {
  return ref(db, `presence/${uid}`);
}
