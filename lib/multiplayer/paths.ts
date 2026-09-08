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
