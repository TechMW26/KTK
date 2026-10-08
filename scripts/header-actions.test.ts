/**
 * Locks the header action contract: the friend affordance renders immediately
 * LEFT of the Leave button inside one row. Regression guard for the layout the
 * user asked for (a stray `margin: 0.5em !important` on `.quit-button` used to
 * push the two controls onto different baselines).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../app/multiplayer/game.tsx", import.meta.url), "utf8");

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(`         ${(err as Error).message}`);
  }
}

console.log("header-actions.test — friend button sits left of Leave");

check("the action row is a right-aligned flex row", () => {
  const block = css.match(/\.mp-head-actions\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(block, /display:\s*flex/);
  assert.match(block, /justify-content:\s*flex-end/);
  assert.match(block, /align-items:\s*center/);
});

check("the Leave button is neutralised inside the action row", () => {
  const rule = css.match(/\.mp-head-actions\s+\.quit-button\s*\{[^}]*\}/)?.[0] ?? "";
  // Must beat the base `.quit-button { margin: 0.5em !important }` declared near the top.
  assert.match(rule, /margin:\s*0\s*!important/);
  assert.match(rule, /align-self:\s*center/);
});

check("the friend button is no longer absolutely pinned to a corner", () => {
  const block = css.match(/\.add-friend-button\s*\{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(block, /position:\s*absolute/);
  assert.match(block, /width:\s*42px/);
  assert.match(block, /height:\s*42px/);
});

check("HeaderActions renders the friend action BEFORE the leave button", () => {
  const start = game.indexOf("function HeaderActions(");
  assert.ok(start !== -1, "HeaderActions not found");
  // Slice to the next top-level function so nested braces don't truncate the body.
  const rest = game.slice(start);
  const nextFn = rest.indexOf("\nfunction ", 1);
  const fn = nextFn === -1 ? rest : rest.slice(0, nextFn);
  const friendAt = fn.indexOf("{friendAction}");
  const leaveAt = fn.indexOf('className="quit-button"');
  assert.ok(friendAt !== -1, "friendAction slot missing");
  assert.ok(leaveAt !== -1, "leave button missing");
  assert.ok(friendAt < leaveAt, "friend action must come first in DOM order");
});

check("every MpFrame header uses HeaderActions, not a bare quit button", () => {
  // A bare `<button className="quit-button">` inside the JSX would bypass the row.
  const bare = [...game.matchAll(/<button className="quit-button"/g)];
  assert.equal(bare.length, 1, `expected exactly 1 (inside HeaderActions), found ${bare.length}`);
});

check("Header no longer takes a friendAction prop", () => {
  assert.match(game, /function Header\(\{\s*mp,\s*activeSeconds\s*\}/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
