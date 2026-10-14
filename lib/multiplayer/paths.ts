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
// Matchmaking ("Search Online Players") — simple pool
// Layout:
//   matchmakingPool/{uid}: { name, joinedAt, updatedAt, pair, roomCode }
//     One record per waiting player. The whole pool is readable and writable by
//     any authenticated player: the host stamps the pair's `roomCode` onto BOTH
//     members' records, so each player learns its room by reading its OWN record.
//     That cross-write is the point — it removes the cross-player discovery the
//     previous per-uid design needed, which is what made pairing unreliable.
//
//     NOTE: this node requires the `matchmakingPool` rule in
//     firebase/database.rules.json. The older self-only `matchmaking` /
//     `matchmakingHost` nodes and the `matchmakingPairs` claim are retired and can
//     be cleared.
// ---------------------------------------------------------------------------

/** This player's own record in the search pool. */
export function poolEntryRef(db: Database, uid: string): DatabaseReference {
  return ref(db, `matchmakingPool/${uid}`);
}

/** The whole search pool. */
export function poolAllRef(db: Database): DatabaseReference {
  return ref(db, "matchmakingPool");
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
