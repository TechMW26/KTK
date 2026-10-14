/**
 * Matchmaking pairing contract.
 *
 * Run:  node --experimental-strip-types scripts/matchmaking.test.ts
 *
 * Two invariants, both of which the previous design got wrong and which produced
 * the "NO PLAYER FOUND" symptom:
 *
 *  1. STALENESS — a record older than `MATCHMAKING_STALE_MS` must never be
 *     paired with, or a crashed client traps every later searcher forever.
 *  2. DETERMINISTIC HOST — for a given pair, both clients must compute the SAME
 *     host, and that host must be exactly one of them. The old code raced a shared
 *     claim whose tie-break was arbitrary, so both sides could end up waiting.
 *
 * The predicates below are faithful copies of `fresh` / `hostOf` / the opponent
 * pick in `services/matchmakingService.ts`; the service imports Firebase, which is
 * why the rules are pinned here rather than by importing it.
 */
import { MATCHMAKING_STALE_MS } from "../lib/multiplayer/types.ts";
import { strict as assert } from "node:assert";

const fresh = (stamp: number | undefined): boolean =>
  typeof stamp === "number" && Date.now() - stamp < MATCHMAKING_STALE_MS;

// Mirrors pairKeyOf / peerOf / hostOf. The separator is "|" because uids can
// contain underscores — see the note in services/matchmakingService.ts.
const pairKeyOf = (a: string, b: string): string => [a, b].sort().join("|");
const peerOf = (pair: string, uid: string): string => {
  const [a, b] = pair.split("|");
  return a === uid ? b : a;
};
const hostOf = (a: string, b: string): string => [a, b].sort()[0];

interface Entry {
  uid: string;
  name: string;
  joinedAt: number;
  updatedAt: number;
  roomCode?: string;
}

/** Mirror of the opponent pick in stepMatchmaking. */
const pickOpponent = (pool: Entry[], uid: string): Entry | null => {
  const others = pool
    .filter((e) => e.uid !== uid && fresh(e.updatedAt) && !e.roomCode)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  return others[0] ?? null;
};

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${name}\n       ${(err as Error).message}`);
  }
}

console.log("matchmaking.test — pool staleness + deterministic host");

// Stamped per-assertion, not once at module load: MATCHMAKING_STALE_MS is only
// 10s, so a timestamp captured at the top of the file drifts past the boundary
// while the full `npm test` chain runs and flips the boundary cases.
const now = () => Date.now();
const stale = () => now() - MATCHMAKING_STALE_MS - 1;

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

check("a just-refreshed record counts as live", () => {
  assert.equal(fresh(now()), true);
});

check("a record at the staleness boundary is still live", () => {
  assert.equal(fresh(now() - MATCHMAKING_STALE_MS + 1), true);
});

check("a record past the boundary is stale", () => {
  assert.equal(fresh(stale()), false);
});

check("a record with no clock is never trusted", () => {
  // Unlike the old per-uid records, a pool entry always carries `updatedAt`.
  // Treating a missing clock as live would make a half-written record immortal.
  assert.equal(fresh(undefined), false);
});

check("a ~30-day-old record is stale (the real abandoned record)", () => {
  assert.equal(fresh(now() - 30 * 24 * 60 * 60 * 1000), false);
});

check("the opponent pick skips a stale record but still finds a live one", () => {
  const abandoned: Entry = { uid: "ghost", name: "Ghost", joinedAt: 1, updatedAt: stale() };
  const live: Entry = { uid: "peer", name: "Peer", joinedAt: 2, updatedAt: now() };
  assert.equal(pickOpponent([abandoned], "me"), null, "an abandoned record must not pair");
  assert.equal(pickOpponent([abandoned, live], "me")?.uid, "peer", "the live record must win");
});

check("the opponent pick skips a player already committed to a room", () => {
  const committed: Entry = {
    uid: "busy",
    name: "Busy",
    joinedAt: 1,
    updatedAt: now(),
    roomCode: "ABCDEF",
  };
  const waiting: Entry = { uid: "free", name: "Free", joinedAt: 2, updatedAt: now() };
  assert.equal(pickOpponent([committed], "me"), null, "a committed player is not available");
  assert.equal(pickOpponent([committed, waiting], "me")?.uid, "free");
});

check("the longest-waiting opponent is chosen first", () => {
  const older: Entry = { uid: "old", name: "Old", joinedAt: 100, updatedAt: now() };
  const newer: Entry = { uid: "new", name: "New", joinedAt: 900, updatedAt: now() };
  assert.equal(pickOpponent([newer, older], "me")?.uid, "old");
});

check("we are never offered ourselves", () => {
  const me: Entry = { uid: "me", name: "Me", joinedAt: 1, updatedAt: now() };
  assert.equal(pickOpponent([me], "me"), null);
});

// ---------------------------------------------------------------------------
// Deterministic host (the actual pairing bug)
// ---------------------------------------------------------------------------

check("hostOf is symmetric: both players compute the same host", () => {
  // This is the property the old atomic claim lacked. Whatever the uid strings,
  // A computing "who hosts (A,B)" must equal B computing "who hosts (B,A)".
  const cases: [string, string][] = [
    ["aaa", "bbb"],
    ["zzz", "aaa"],
    ["m1", "m2"],
    ["u_10", "u_9"],
  ];
  for (const [a, b] of cases) {
    assert.equal(hostOf(a, b), hostOf(b, a), `${a}/${b} disagree on the host`);
  }
});

check("hostOf always yields exactly one of the pair", () => {
  const pairs: [string, string][] = [
    ["aaa", "bbb"],
    ["zzz", "aaa"],
    ["x", "y"],
  ];
  for (const [a, b] of pairs) {
    const host = hostOf(a, b);
    assert.ok(host === a || host === b, `host ${host} is not a member of the pair`);
    assert.equal([a, b].filter((u) => u === host).length, 1, "exactly one host");
  }
});

check("exactly one side of every pair is the host", () => {
  // The failure mode to prevent: both sides concluding "not me" (nobody creates
  // the room -> "NO PLAYER FOUND") or both concluding "me" (two rooms).
  for (const [a, b] of [
    ["p", "q"],
    ["a1", "a2"],
    ["000", "zzz"],
  ] as [string, string][]) {
    const aIsHost = hostOf(a, b) === a;
    const bIsHost = hostOf(b, a) === b;
    assert.notEqual(
      aIsHost,
      bIsHost,
      `pair ${a}/${b} has ${aIsHost && bIsHost ? "two" : "no"} hosts`,
    );
  }
});

check("pairKeyOf is order-independent and identifies the pair", () => {
  assert.equal(pairKeyOf("b", "a"), pairKeyOf("a", "b"));
  // The peer must be recoverable from the key alone — this is how each player
  // learns its opponent without reading the other's node.
  const key = pairKeyOf("alpha", "beta");
  assert.equal(peerOf(key, "alpha"), "beta");
  assert.equal(peerOf(key, "beta"), "alpha");
});

check("peerOf survives uids containing underscores", () => {
  // Regression: the key used to be "_"-joined, so splitting it back apart broke
  // any uid with an underscore — `user_alpha_user_bravo` yielded the peer
  // "user" instead of "user_bravo"/"user_alpha". Real Firebase uids are
  // alphanumeric, but test/proxy/emulator ids are not, and a wrong peer uid
  // means the wrong pairKey is registered for post-match cleanup.
  const a = "user_alpha";
  const b = "user_bravo";
  assert.equal(peerOf(pairKeyOf(a, b), a), b);
  assert.equal(peerOf(pairKeyOf(a, b), b), a);
  // The realistic case: a provider uid with no separator at all.
  const c = "xs3ahuCkygQIKiES6dAT96zhSWp2";
  const d = "aJY3DDONOreVvz2tzLLfv4ZPwLF3";
  assert.equal(peerOf(pairKeyOf(c, d), c), d);
  assert.equal(peerOf(pairKeyOf(c, d), d), c);
});

check("both sides derive the same pair key from the same two uids", () => {
  const a = "uid_host_candidate";
  const b = "uid_guest_candidate";
  assert.equal(pairKeyOf(a, b), pairKeyOf(b, a));
  // And they agree on who creates the room.
  assert.equal(hostOf(a, b) === a, !(hostOf(b, a) === b));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
