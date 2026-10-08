/**
 * Matchmaking discovery rules.
 *
 * Run:  node --experimental-strip-types scripts/matchmaking.test.ts
 *
 * Guards the staleness contract shared by the three discovery paths. Without it
 * an abandoned record is honoured forever, and because the records are
 * ownership-scoped (only their owner can delete them) a crashed client leaves a
 * permanent trap that hijacks every later pairing attempt.
 *
 * The predicate below is a faithful copy of the `fresh` helper in
 * `services/matchmakingService.ts`; the service itself imports Firebase, which is
 * why the rule is pinned here rather than by importing it.
 */
import { MATCHMAKING_STALE_MS } from "../lib/multiplayer/types.ts";
import { strict as assert } from "node:assert";

const fresh = (stamp: number | undefined): boolean =>
  typeof stamp !== "number" || Date.now() - stamp < MATCHMAKING_STALE_MS;

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

console.log("matchmaking.test — staleness across discovery paths");

// Stamped per-assertion, not once at module load: MATCHMAKING_STALE_MS is only
// 10s, so a timestamp captured at the top of the file drifts past the boundary
// while the full `npm test` chain runs and flips the boundary cases.
const now = () => Date.now();
const stale = () => now() - MATCHMAKING_STALE_MS - 1;

check("a just-refreshed entry counts as live", () => {
  assert.equal(fresh(now()), true);
});

check("an entry at the staleness boundary is still live", () => {
  assert.equal(fresh(now() - MATCHMAKING_STALE_MS + 1), true);
});

check("an entry past the boundary is stale", () => {
  assert.equal(fresh(stale()), false);
});

check("a missing timestamp is tolerated, never treated as stale", () => {
  // Older records predate `updatedAt`; dropping them would break live pairs.
  assert.equal(fresh(undefined), true);
});

check("a ~30-day-old invite is stale (the real abandoned record)", () => {
  const thirtyDaysAgo = now() - 30 * 24 * 60 * 60 * 1000;
  assert.equal(fresh(thirtyDaysAgo), false);
});

check("invite discovery ignores a stale invite but still finds a live one", () => {
  // Mirrors readInviteFor's predicate, including the staleness guard.
  const pick = (entries: Array<{ invitedUid: string; roomCode: string; updatedAt: number }>, uid: string) =>
    entries.find((e) => e.invitedUid === uid && !!e.roomCode && fresh(e.updatedAt)) ?? null;

  const abandoned = { invitedUid: "me", roomCode: "DEAD01", updatedAt: stale() };
  const live = { invitedUid: "me", roomCode: "LIVE01", updatedAt: now() };

  assert.equal(pick([abandoned], "me"), null, "an abandoned invite must not match");
  assert.equal(pick([abandoned, live], "me")?.roomCode, "LIVE01", "the live invite must win");
});

check("pair discovery ignores a stale claim", () => {
  // Mirrors findMyPair's predicate, including the staleness guard.
  const find = (entries: Array<{ members: string[]; claimedAt: number; roomCode?: string }>, uid: string) =>
    entries.find((e) => e.members.includes(uid) && fresh(e.claimedAt)) ?? null;

  const abandoned = { members: ["me", "ghost"], claimedAt: stale(), roomCode: "DEAD01" };
  const live = { members: ["me", "peer"], claimedAt: now(), roomCode: "LIVE01" };

  assert.equal(find([abandoned], "me"), null, "an abandoned claim must not match");
  assert.equal(find([abandoned, live], "me")?.roomCode, "LIVE01", "the live claim must win");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
