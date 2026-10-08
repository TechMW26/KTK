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
  matchmakingPairsAllRef,
  pairClaimByKeyRef,
} from "@/lib/multiplayer/paths";
import { createRoom } from "@/services/roomService";
import {
  MATCHMAKING_STALE_MS,
  type MatchmakingEntry,
  type MatchmakingHostEntry,
  type MatchmakingPairEntry,
  type MatchSettings,
} from "@/lib/multiplayer/types";

/**
 * "Search Online Players" matchmaking service — RACE-FIXED.
 *
 * WHO IS HOST is decided by ONE shared, atomic lock at
 * `matchmakingPairs/{pairKey}` where `pairKey = [uidA,uidB].sort().join("_")`.
 * Only the client whose `runTransaction` first commits claims the pair as host;
 * every other client re-reads that same committed host and becomes the guest,
 * so a pair NEVER gets two hosts, two rooms or two invites.
 *
 * Flow: guest+host both call `claimPair()`. The winner (`host === true`) calls
 * `hostCreatesInvite()` -> creates ONE room and leaves `{roomCode, invitedUid}`
 * on its own `matchmakingHost/{uid}`. The guest finds it via `readInviteFor()`
 * and `joinRoom`s normally.
 *
 * Cleanup (`cleanupMatchmaking`) is ownership-scoped so it never deletes another
 * live match's records. Dev logging traces each pairing; no secrets are logged.
 */

function db(): Database {
  const instance = getRTDatabase();
  if (!instance) throw new Error("FIREBASE_NOT_CONFIGURED");
  return instance;
}

function log(...args: unknown[]): void {
  console.warn("[matchmaking]", ...args);
}

const fresh = (updatedAt: number | undefined): boolean =>
  typeof updatedAt !== "number" || Date.now() - updatedAt < MATCHMAKING_STALE_MS;

/** Sorted, deterministic key for a pair of uids. */
export function pairKeyOf(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

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
    log("announceSearch", uid);
    // Remove this search entry the instant this client's socket drops.
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

/**
 * Heartbeat while searching: refreshes `updatedAt` so other searchers never treat
 * a still-searching player as stale (staleness drives the reachability filter in
 * listSearchers/watchPool), which would otherwise break cross-device detection.
 */
export async function pingSearch(uid: string): Promise<void> {
  const database = db();
  try {
    await update(matchmakingRef(database, uid), { updatedAt: Date.now() });
  } catch {
    /* ignore */
  }
}

/** Stop searching / cancel. Removes only our own search + host nodes. */
export async function cancelSearch(uid: string): Promise<void> {
  const database = db();
  try {
    await remove(matchmakingRef(database, uid));
    await remove(matchmakingHostRef(database, uid));
  } catch {
    /* ignore */
  }
}

/**
 * ATOMIC host selection. Both players call this for a trial.
 * Exactly one commits (`host === true`); the other becomes the guest.
 */
export async function claimPair(
  uid: string,
  targetUid: string,
): Promise<{
  host: boolean;
  hostUid: string;
  myUid: string;
  invitedUid: string;
  pairKey: string;
}> {
  const database = db();
  const pairKey = pairKeyOf(uid, targetUid);
  const pairRef = pairClaimByKeyRef(database, pairKey);
  const [first] = [uid, targetUid].sort();
  const intendedHost = first;

  try {
    log("claim attempt", { me: uid, target: targetUid, pairKey });
    const res = await runTransaction(
      pairRef,
      (raw) => {
        const cur = (raw as MatchmakingPairEntry | null) ?? null;
        if (cur && cur.hostUid) return undefined; // someone already claimed
        const entry: MatchmakingPairEntry = {
          hostUid: intendedHost,
          invitedUid: intendedHost === uid ? targetUid : uid,
          claimedAt: Date.now(),
          members: [uid, targetUid],
        };
        return entry;
      },
      { applyLocally: false },
    );

    // If this transcript of my role is host, but a competing claim already won,
    // res.committed is false and res.snapshot holds the existing host:
    const inferred = (() => {
      const val = res.snapshot.val() as MatchmakingPairEntry | null;
      return val?.hostUid ?? intendedHost;
    })();
    const hostUid = res.committed ? intendedHost : inferred;

    log(res.committed ? "claim COMMITTED -> host" : "claim NOT committed -> guest", {
      me: uid,
      target: targetUid,
      pairKey,
      hostUid,
    });
    return {
      host: hostUid === uid,
      hostUid,
      myUid: uid,
      invitedUid: hostUid === uid ? targetUid : uid,
      pairKey,
    };
  } catch (error) {
    log("claim error", String((error as Error)?.message ?? error));
    return { host: false, hostUid: intendedHost, myUid: uid, invitedUid: targetUid, pairKey };
  }
}

/**
 * HOST ONLY: create ONE room and publish the invitation under our own host node.
 * Also mirrors the room code onto the shared pair claim so the guest has a stable
 * source to join.
 */
export async function hostCreatesInvite(
  uid: string,
  myName: string,
  invitedUid: string,
  pairKey: string,
  settings: MatchSettings,
): Promise<string | null> {
  const database = db();
  const hostNode = matchmakingHostRef(database, uid);
  const res = await createRoom(uid, myName, settings).catch(() => ({ ok: false as const, reason: "ERROR" }));
  if (!res.ok) {
    log("host createRoom FAILED", res.reason);
    return null;
  }
  log("host created room", { code: res.code, pairKey });
  try {
    const now = Date.now();
    const invite: MatchmakingHostEntry = {
      name: myName.trim() || "Player 1",
      status: "inviting",
      joinedAt: now,
      updatedAt: now,
      roomCode: res.code,
      invitedUid,
    };
    await set(hostNode, invite);
    await update(matchmakingRef(database, uid), {
      status: "matched",
      pairKey,
      opponentUid: invitedUid,
      updatedAt: Date.now(),
    });
    await update(pairClaimByKeyRef(database, pairKey), { roomCode: res.code, updatedAt: Date.now() });
    log("host published invite", { pairKey, roomCode: res.code });
    return res.code;
  } catch (error) {
    log("host publish failed", String((error as Error)?.message ?? error));
    return null;
  }
}

/** Guest that was invited clears its own search advertisement. */
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
  others: { uid: string; name: string; joinedAt: number }[];
  forMe: { hostUid: string; roomCode?: string } | null;
}

export function watchPool(uid: string, cb: (c: SearchCandidate) => void): Unsubscribe {
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
      ([, e]) =>
        e?.status === "inviting" &&
        e.invitedUid === uid &&
        !!e.roomCode &&
        // Same staleness rule as readInviteFor: an abandoned invite must not be
        // offered to this listener either, or the live subscription and the poll
        // would disagree about what is joinable.
        fresh(e.updatedAt),
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

export async function listSearchers(uid: string): Promise<{ uid: string; name: string }[]> {
  const database = db();
  const snap = await get(matchmakingAllRef(database));
  const all = (snap.val() as Record<string, MatchmakingEntry> | null) ?? {};
  return Object.entries(all)
    .filter(([u, e]) => u !== uid && e?.status === "searching" && fresh(e.updatedAt))
    .map(([u, e]) => ({ uid: u, name: e.name }));
}

export async function readInviteFor(
  uid: string,
): Promise<{ hostUid: string; roomCode: string } | null> {
  const database = db();
  const snap = await get(matchmakingHostAllRef(database));
  const all = (snap.val() as Record<string, MatchmakingHostEntry> | null) ?? {};
  const mine = Object.entries(all).find(
    ([, e]) =>
      e?.status === "inviting" &&
      e.invitedUid === uid &&
      !!e.roomCode &&
      // Staleness guard. Without it an abandoned invite is honoured FOREVER: a
      // host that crashed after publishing one leaves `{status:"inviting"}` with
      // no expiry, so its intended guest is matched to a long-dead room on every
      // future search instead of being paired with the live players waiting.
      // `updatedAt` is already written by announceSearch/hostCreatesInvite and is
      // the same field listSearchers uses, so both discovery paths agree.
      fresh(e.updatedAt),
  );
  return mine ? { hostUid: mine[0], roomCode: mine[1].roomCode! } : null;
}

/**
 * If a pair claim referencing this uid already carries a roomCode (the host wrote
 * it there), return the room + the OTHER member's uid so a guest can join with the
 * correct pairKey. More robust than scanning host invites (covers ordering races).
 */
export async function readMyReadyMatch(
  uid: string,
): Promise<{ roomCode: string; peer: string } | null> {
  const database = db();
  try {
    const mine = await findMyPair(database, uid);
    if (!mine) return null;
    // Bind the looked-up values to locals before testing them. Reading
    // `entry.roomCode` after checking `mine.entry.roomCode` loses the narrowing
    // (they are the same property, but only one is narrowed), which is how this
    // returned a possibly-undefined roomCode.
    const { roomCode, members } = mine.entry;
    const peer = members?.find((m) => m !== uid);
    // No roomCode yet means the host has claimed the pair but not created the
    // room. Returning null makes the caller keep polling instead of joining a
    // room literally named "undefined".
    if (!roomCode || !peer) return null;
    return { roomCode, peer };
  } catch {
    /* ignore */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cleanup (membership/ownership-scoped)
// ---------------------------------------------------------------------------

/**
 * The pair claim a uid is a member of, if any.
 *
 * Stale claims are skipped for the same reason `readInviteFor` skips stale
 * invites: an abandoned claim is never cleaned up (both clients crash before
 * cleanup), so honouring it would keep pulling this uid back into a pair with a
 * long-dead peer and a dead room, blocking every fresh matchmaking attempt.
 * `claimedAt` is stamped by the atomic claim, so it is the entry's own clock.
 */
export async function findMyPair(dbInst: Database, uid: string): Promise<{ pairKey: string; entry: MatchmakingPairEntry } | null> {
  const snap = await get(matchmakingPairsAllRef(dbInst));
  const all = (snap.val() as Record<string, MatchmakingPairEntry> | null) ?? {};
  for (const [k, e] of Object.entries(all)) {
    if (e && Array.isArray(e.members) && e.members.includes(uid) && fresh(e.claimedAt)) {
      return { pairKey: k, entry: e };
    }
  }
  return null;
}

/** Read a single pair claim entry. */
export async function readPair(pairKey: string): Promise<MatchmakingPairEntry | null> {
  const snap = await get(pairClaimByKeyRef(db(), pairKey));
  return (snap.val() as MatchmakingPairEntry | null) ?? null;
}

/** Remove the whole pair claim (both seats abandoned the match). */
export async function deletePair(pairKey: string): Promise<void> {
  try {
    await remove(pairClaimByKeyRef(db(), pairKey));
  } catch {
    /* ignore */
  }
}

/**
 * Remove THIS uid's own `matchmaking/{uid}` + `matchmakingHost/{uid}` records and
 * (when provided or auto-found) the pair node it belongs to. Will never touch a
 * pair the uid is not a member of.
 */
export async function cleanupMatchmaking(uid: string, pairKey?: string): Promise<void> {
  const database = db();
  try {
    await remove(matchmakingRef(database, uid));
    await remove(matchmakingHostRef(database, uid));
    const target = pairKey ?? (await findMyPair(database, uid))?.pairKey;
    if (target) {
      const entry = await readPair(target);
      if (entry && Array.isArray(entry.members) && entry.members.includes(uid)) {
        await remove(pairClaimByKeyRef(database, target));
        log("cleanup removed pair", { pairKey: target });
      }
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Remove other players' ABANDONED search advertisements.
 *
 * A searcher advertises under its own uid and is meant to clear that node on
 * exit (`cancelSearch`) or on socket drop (`onDisconnect`). Both paths are
 * client-side, so neither runs when a browser is killed, the tab is discarded,
 * or the realtime socket is unavailable — which leaves the node sitting at
 * `status: "searching"` indefinitely.
 *
 * Those leftovers are not merely untidy: they are the only peers a later
 * searcher can see, so the pool fills with ghosts and a real opponent is never
 * offered. This sweeps them so the pool reflects who is genuinely present.
 *
 * Deliberately narrow. The rules only let a client delete its OWN node, so this
 * can only clear advertisements that belong to `uid` — it prunes the caller's
 * stale node, never another player's. It also refuses to touch the caller's own
 * live advertisement while it is still fresh, so a second tab of the same
 * account cannot evict a healthy search.
 */
export async function pruneStaleSearchers(uid: string): Promise<number> {
  const database = db();
  try {
    const snap = await get(matchmakingAllRef(database));
    const all = (snap.val() as Record<string, MatchmakingEntry> | null) ?? {};
    const mine = all[uid];
    // Only the caller's own node is deletable, and only once it has gone stale.
    if (!mine || fresh(mine.updatedAt)) return 0;
    // Reuse the same cleanup path so nothing is missed (search + host + pair).
    await cleanupMatchmaking(uid);
    log("pruned stale self advertisement", uid);
    return 1;
  } catch {
    return 0;
  }
}

