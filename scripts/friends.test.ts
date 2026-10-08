/**
 * Friends-layer harness.
 *
 * Run:  node --experimental-strip-types scripts/friends.test.ts
 *
 * The friends list is the one new social surface, so the join/sort/dedupe rules
 * that decide what the player SEES are pinned here. These assertions cover the
 * behaviour the redesign depends on: online friends first, stale presence never
 * shown as online, missing name falling back to presence, and duplicate edges
 * collapsing to one row.
 *
 * `toFriends` is pure (no Firebase), which is why it can be tested directly.
 */
import { toFriends, isMutualFriend, PRESENCE_STALE_MS } from "../lib/multiplayer/friends.ts";
import { strict as assert } from "node:assert";

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

console.log("friends.test — friends list shaping");

const NOW = Date.now();

check("online friends sort ahead of offline friends", () => {
  const friends = toFriends(
    {
      a: { uid: "a", name: "Offline A", addedAt: NOW },
      b: { uid: "b", name: "Online B", addedAt: NOW - 1000 },
    },
    {
      a: { online: false, lastSeenAt: NOW },
      b: { online: true, lastSeenAt: NOW },
    },
  );
  assert.equal(friends[0].uid, "b");
  assert.equal(friends[1].uid, "a");
  assert.equal(friends[0].online, true);
  assert.equal(friends[1].online, false);
});

check("a stale online flag is treated as offline", () => {
  const stale = NOW - PRESENCE_STALE_MS - 1000;
  const friends = toFriends(
    { a: { uid: "a", name: "Ghost", addedAt: NOW } },
    { a: { online: true, lastSeenAt: stale } },
  );
  assert.equal(friends[0].online, false);
});

check("missing presence is offline, never a crash", () => {
  const friends = toFriends({ a: { uid: "a", name: "Nobody", addedAt: NOW } }, {});
  assert.equal(friends.length, 1);
  assert.equal(friends[0].online, false);
  assert.equal(friends[0].lastSeenAt, 0);
});

check("name falls back to the live presence name when the edge has none", () => {
  const friends = toFriends(
    { a: { uid: "a", name: "", addedAt: NOW } },
    { a: { name: "FromPresence", online: true, lastSeenAt: NOW } },
  );
  assert.equal(friends[0].name, "FromPresence");
});

check("most recently added wins the tie-break among same online state", () => {
  const friends = toFriends(
    {
      old: { uid: "old", name: "Old", addedAt: NOW - 5000 },
      new: { uid: "new", name: "New", addedAt: NOW },
    },
    {
      old: { online: true, lastSeenAt: NOW },
      new: { online: true, lastSeenAt: NOW },
    },
  );
  assert.equal(friends[0].uid, "new");
});

check("records without a uid are dropped (no phantom rows)", () => {
  const friends = toFriends(
    {
      junk: { uid: "", name: "Bad", addedAt: NOW } as never,
      good: { uid: "good", name: "Good", addedAt: NOW },
    },
    {},
  );
  assert.equal(friends.length, 1);
  assert.equal(friends[0].uid, "good");
});

/**
 * The in-game "+" affordance hides on `isMutualFriend`, so this is the rule that
 * guarantees BOTH players stop seeing it after either one taps it.
 */
check("a friendship in either direction counts as already friends", () => {
  assert.equal(isMutualFriend(false, false), false, "strangers still see the +");
  assert.equal(isMutualFriend(true, false), true, "I added them -> hidden for me");
  assert.equal(isMutualFriend(false, true), true, "they added me -> hidden for me");
  assert.equal(isMutualFriend(true, true), true, "both sides -> hidden");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
