import {
  get,
  onValue,
  set,
  remove,
  update,
  onDisconnect,
  type Database,
  type DataSnapshot,
  type Unsubscribe,
} from "firebase/database";
import { getRTDatabase } from "@/lib/firebase/database";
import { poolAllRef, poolEntryRef } from "@/lib/multiplayer/paths";
import { createRoom } from "@/services/roomService";
import {
  MATCHMAKING_STALE_MS,
  type MatchmakingEntry,
  type MatchmakingPoolEntry,
  type MatchSettings,
} from "@/lib/multiplayer/types";

/**
 * "Search Online Players" matchmaking — one pool, one deterministic rule.
 *
 *  1. Every searcher writes ONE record to `matchmakingPool/{uid}` and heartbeats
 *     it. Records older than `MATCHMAKING_STALE_MS` are ignored, so a crashed
 *     client can never trap a later searcher.
 *  2. Each poll looks for the longest-waiting other searcher. The pair key is
 *     `[me, them].sort().join("_")` and the player with the LOWER uid is the host.
 *     That tie-break is a pure function of the two uids, so both sides always
 *     agree on exactly one host — no claim, no transaction, no non-determinism.
 *  3. The host creates the room and writes `{pair, roomCode}` onto BOTH records.
 *     The guest just waits and reads its OWN record.
 *  4. Whoever sees `roomCode` on its own record joins that room.
 *
 * Why this shape: the previous design had each side discover the OTHER's private
 * nodes (`matchmaking/{uid}`, `matchmakingHost/{uid}`) and raced a shared
 * `matchmakingPairs/{key}` claim. The host's proof of pairing lived on a record the
 * guest never read, and the claim's tie-break was non-deterministic, so the two
 * sides could both end up waiting — which surfaced as "NO PLAYER FOUND" every
 * time. Writing the agreed room code directly onto each member's own record
 * removes every discovery hop.
 */

function db(): Database {
  const instance = getRTDatabase();
  if (!instance) throw new Error("FIREBASE_NOT_CONFIGURED");
  return instance;
}

function log(...args: unknown[]): void {
  console.warn("[matchmaking]", ...args);
}

/** An entry is live only if its clock exists and is recent enough. */
function fresh(entry: { updatedAt?: number } | null | undefined): boolean {
  const stamp = entry?.updatedAt;
  if (typeof stamp !== "number") return false;
  return Date.now() - stamp < MATCHMAKING_STALE_MS;
}

/**
 * Sorted, deterministic key for a pair of uids.
 *
 * The separator is "|" and NOT "_": uid strings can contain underscores, so a
 * key like `user_alpha_user_bravo` cannot be split back into the two uids — doing
 * so yields `user` and `alpha_user_bravo`. "|" cannot appear in a Firebase uid,
 * which makes the key safely reversible. `peerOf` is the only supported way to
 * read it back.
 */
export function pairKeyOf(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("|");
}

/** The OTHER member of a pair, given its key. */
export function peerOf(pair: string, uid: string): string {
  const [a, b] = pair.split("|");
  return a === uid ? b : a;
}

/** The host of a pair is always the lower uid — both sides compute this locally. */
export function hostOf(uidA: string, uidB: string): string {
  return [uidA, uidB].sort()[0];
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Join the pool. `roomCode`/`pair` are omitted so a searcher that re-announces
 * after a match clears the previous pairing rather than being pulled straight
 * back into the finished room.
 */
export async function announceSearch(uid: string, name: string): Promise<boolean> {
  const database = db();
  const now = Date.now();
  const entry: MatchmakingEntry = {
    name: name.trim() || "Player",
    status: "searching",
    joinedAt: now,
    updatedAt: now,
  };
  try {
    await set(poolEntryRef(database, uid), entry);
    try {
      await onDisconnect(poolEntryRef(database, uid)).remove();
    } catch {
      /* best-effort — the staleness window covers a failed binding */
    }
    log("announceSearch", uid);
    return true;
  } catch (error) {
    log("announceSearch failed", String((error as Error)?.message ?? error));
    return false;
  }
}

/** Refresh `updatedAt` so nobody treats a still-waiting player as stale. */
export async function pingSearch(uid: string): Promise<void> {
  try {
    await update(poolEntryRef(db(), uid), { updatedAt: Date.now() });
  } catch {
    /* ignore */
  }
}

/** Leave the pool. Removes only our own record. */
export async function cancelSearch(uid: string): Promise<void> {
  try {
    await remove(poolEntryRef(db(), uid));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Pool reads
// ---------------------------------------------------------------------------

/** Our own live record, or null if we are not in the pool. */
export async function readMyEntry(uid: string): Promise<MatchmakingEntry | null> {
  const snap = await get(poolEntryRef(db(), uid));
  const entry = (snap.val() as MatchmakingEntry | null) ?? null;
  return fresh(entry) ? entry : null;
}

/** Turn our own record into the room we should join, if it has been stamped. */
function roomFromEntry(
  entry: MatchmakingEntry | null,
  uid: string,
): { roomCode: string; peer: string } | null {
  if (!entry?.roomCode || !entry.pair) return null;
  return { roomCode: entry.roomCode, peer: peerOf(entry.pair, uid) };
}

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

/**
 * One matchmaking step: pair if we can, otherwise wait.
 *
 * Returns the room the caller should join, or null to keep searching. Safe to
 * call on every poll — it never claims and never touches a pair it is not in.
 */
export async function stepMatchmaking(
  uid: string,
  name: string,
  settings: MatchSettings,
): Promise<{ roomCode: string; peer: string } | null> {
  const database = db();

  // 1) Already matched? The host stamps OUR record, so this is the only place we
  //    need to look to learn our room — no cross-player discovery.
  const mine = roomFromEntry(await readMyEntry(uid), uid);
  if (mine) return mine;

  // 2) Not matched yet: find the longest-waiting opponent who is not committed.
  const snap = await get(poolAllRef(database));
  const all = (snap.val() as Record<string, MatchmakingEntry> | null) ?? {};
  const opponent = Object.entries(all)
    .filter(([u, e]) => u !== uid && fresh(e) && !e.roomCode)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)[0];

  if (!opponent) return null;
  const [opponentUid, opponentEntry] = opponent;

  const pair = pairKeyOf(uid, opponentUid);

  // 3) Guest: the host will stamp our record. Re-read in case it already did
  //    between the two reads above; otherwise keep waiting.
  if (hostOf(uid, opponentUid) !== uid) {
    return roomFromEntry(await readMyEntry(uid), uid);
  }
  // 4) Host: create exactly ONE room and publish it to BOTH records.
  const created = await createRoom(uid, name, settings).catch(() => ({
    ok: false as const,
    reason: "ERROR" as const,
  }));
  if (!created.ok) {
    log("host createRoom FAILED", created.reason);
    return null;
  }

  const stamp = {
    status: "matched" as const,
    pair,
    roomCode: created.code,
    opponentName: opponentEntry.name,
    updatedAt: Date.now(),
  };
  // Our own record first: once this lands we are committed, so `!e.roomCode`
  // above stops offering us to anyone else.
  await update(poolEntryRef(database, uid), stamp).catch(() => {});
  // Then the guest's. A failure here means the guest keeps waiting and the
  // staleness window retires our record — a missed pairing, never a wrong room.
  await update(poolEntryRef(database, opponentUid), stamp).catch(() => {});

  log("host paired", { pair, roomCode: created.code, guest: opponentUid });
  return { roomCode: created.code, peer: opponentUid };
}

// ---------------------------------------------------------------------------
// Observing the pool
// ---------------------------------------------------------------------------

/** Subscribe to the set of players currently waiting (stale/committed excluded). */
export function watchPool(
  uid: string,
  cb: (others: { uid: string; name: string; joinedAt: number }[]) => void,
): Unsubscribe {
  return onValue(poolAllRef(db()), (snap: DataSnapshot) => {
    const all = (snap.val() as Record<string, MatchmakingEntry> | null) ?? {};
    cb(
      Object.entries(all)
        .filter(([u, e]) => u !== uid && fresh(e) && !e.roomCode)
        .map(([u, e]) => ({ uid: u, name: e.name, joinedAt: e.joinedAt }))
        .sort((a, b) => a.joinedAt - b.joinedAt),
    );
  });
}

/** Leave the pool (kept as a named cleanup for the room lifecycle). */
export async function cleanupMatchmaking(uid: string): Promise<void> {
  await cancelSearch(uid);
}

export type { MatchmakingPoolEntry };
