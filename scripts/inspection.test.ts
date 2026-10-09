/**
 * Locks the physical-inspection contract:
 *  - the inspection state is OPTIONAL presentation, not a rule (never bumps `seq`);
 *  - it synchronises a card POSITION only, never the hidden card's identity;
 *  - it is written by the service (guarded on turn/phase), driven by the hook,
 *    and consumed by the opponent's row + the hand overlay;
 *  - the card lift is proportional to the card, not a hard-coded pixel value.
 *
 * These are the invariants most likely to be broken by a well-meaning refactor,
 * so they are asserted against the source rather than left to review.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const royal = readFileSync(new URL("../app/royal.css", import.meta.url), "utf8");
const types = readFileSync(new URL("../lib/multiplayer/types.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../services/multiplayerService.ts", import.meta.url), "utf8");
const hook = readFileSync(new URL("../hooks/useMultiplayer.ts", import.meta.url), "utf8");
const game = readFileSync(new URL("../app/multiplayer/game.tsx", import.meta.url), "utf8");
const visual = readFileSync(
  new URL("../features/game/components/InspectionVisual.tsx", import.meta.url),
  "utf8",
);

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

console.log("inspection.test — physical card inspection is presentation-only");

// --- the synced field ------------------------------------------------------

check("GameState carries an optional inspectingCardIndex", () => {
  assert.match(types, /inspectingCardIndex\?:\s*number\s*\|\s*null/);
});

check("the field is documented as position-only, never card identity", () => {
  const decl = types.slice(types.indexOf("inspectingCardIndex"));
  const doc = types.slice(types.indexOf("TEMPORARY presentation state"), types.indexOf("inspectingCardIndex"));
  assert.match(doc, /POSITION/);
  assert.match(doc, /does NOT carry/i);
  // It must never be confused with the secret (which holds the King position).
  assert.ok(!/kingIndex\s*:/.test(decl.slice(0, 40)), "inspection field must not alias the secret");
});

// --- the service -----------------------------------------------------------

check("publishInspecting exists and only the acting seat may write", () => {
  assert.match(service, /export async function publishInspecting/);
  const fn = service.slice(
    service.indexOf("export async function publishInspecting"),
    service.indexOf("// Dealer"),
  );
  assert.match(fn, /cur\.actingSeat === args\.seat/);
  assert.match(fn, /cur\.phase === "guess" \|\| cur\.phase === "dealer-hide"/);
});

check("publishInspecting does NOT advance the game sequence", () => {
  const fn = service.slice(
    service.indexOf("export async function publishInspecting"),
    service.indexOf("// Dealer"),
  );
  // It is presentation: writing it must not look like a rules transition.
  assert.match(fn, /inspectingCardIndex: clamp/);
  assert.ok(!/seq:/.test(fn), "an inspection must never bump the game seq counter");
});

check("an inspection is cleared by every turn-ending transition", () => {
  // Guess committed, dealer locked, round resolved, and each new round start.
  const clears = service.match(/inspectingCardIndex: null/g) ?? [];
  assert.ok(clears.length >= 5, `expected the field cleared at every transition, found ${clears.length}`);
});

// --- the debounce ----------------------------------------------------------

check("the hook de-dupes repeat writes for the same index", () => {
  assert.match(hook, /inspectingRef/);
  const fn = hook.slice(hook.indexOf("const setInspecting"), hook.indexOf("Safety net:"));
  assert.match(fn, /if \(inspectingRef\.current === index\) return;/);
});

check("the hook forgets the last index when round / turn changes", () => {
  assert.match(hook, /inspectingRef\.current = null;/);
  assert.match(hook, /\[game\?\.level, game\?\.round, game\?\.actingSeat, game\?\.phase\]/);
});

// --- the wiring ------------------------------------------------------------

check("both the guesser's aim and the dealer's choice publish inspection", () => {
  const calls = game.match(/mp\.setInspecting\(/g) ?? [];
  assert.ok(calls.length >= 4, `expected publish + clear call sites, found ${calls.length}`);
  assert.match(game, /setInspecting\(done \? null : targetCard\)/);
  assert.match(game, /setInspecting\(isBluff \? null : kingIndex\)/);
});

check("the observer renders the synced inspection, and never the actor", () => {
  assert.match(game, /function OpponentRow/);
  assert.match(game, /const inspecting = g\.inspectingCardIndex \?\? null;/);
  assert.match(game, /<InspectionVisual index=\{inspecting\}/);
});

check("the opponent's hand is non-interactive", () => {
  assert.match(visual, /pointer-events: none/);
  assert.match(visual, /aria-hidden/);
});

// --- the hand asset --------------------------------------------------------

check("the hand uses the complete transparent gauntlet asset", () => {
  assert.match(visual, /src="\/gauntlet-hand\.png"/);
  assert.ok(!/<img[^>]*>[^<]*<svg/.test(visual), "no inline replacement graphic");
});

check("the hand is anchored to the card slot, not the screen", () => {
  assert.match(visual, /cardFanSlot\(slot, cardCount\)/);
  assert.match(visual, /"--inspect-x": `calc\(\$\{x \/ CARD_PITCH\} \* var\(--card-pitch/);
});

// --- proportional movement -------------------------------------------------

check("the inspected card lift is proportional, never a magic pixel value", () => {
  const rule = css.match(/\.cards-row\.fanned \.playing-card\.card-inspected\s*\{[^}]*\}/)?.[0] ?? "";
  assert.ok(rule, "expected the fanned inspected-card rule");
  assert.match(rule, /translateY\(/);
  assert.match(rule, /-50%/, "the lift must be 50% of the card itself");
  assert.ok(!/translateY\(-?\d+px\)/.test(rule), "no hard-coded pixel lift");
});

check("the card and hand share one direction flag so they move together", () => {
  // The row DEFINES it (so the card can inherit it) and the hand sets the same
  // value inline; the mirrored row flips both together.
  assert.match(css, /\.cards-row\s*\{[^}]*--inspect-dir:\s*1/);
  assert.match(css, /\.cards-row\.fanned\.mirrored\s*\{[^}]*--inspect-dir:\s*-1/);
  assert.match(visual, /"--inspect-dir": mirrored \? -1 : 1/);
});

check("the board fits viewport width and height independently", () => {
  const rule = royal.match(/\.game-screen\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(rule, /width:\s*min\(640px, 100%\)/);
  assert.match(rule, /height:\s*calc\([^;]*100dvh/);
  assert.match(rule, /max-width:\s*100%/);
  // The shell must not add its padding outside the viewport box.
  assert.match(css, /\.game-shell\s*\{[^}]*box-sizing:\s*border-box/);
});

// --- responsive board ------------------------------------------------------

check("the inspected hand follows the same lift as its card", () => {
  const cardRule = royal.match(/\.game-screen \.cards-row\.fanned \.playing-card\.card-inspected\s*\{[^}]*\}/)?.[0] ?? "";
  const handRule = royal.match(/\.game-screen \.cards-row \.inspection-hand\s*\{[^}]*top:[^}]*\}/)?.[0] ?? "";
  assert.match(cardRule, /var\(--inspect-lift\) \* var\(--inspect-dir/);
  assert.match(handRule, /var\(--inspect-lift\) \* var\(--inspect-dir/);
});

check("card spacing follows usable width and hands paint above lifted cards", () => {
  assert.match(royal, /--card-pitch:\s*calc\(\(96cqw[^;]*--card-count/);
  assert.match(royal, /--fan-overlap:\s*calc\(var\(--card-pitch\) - var\(--fan-card-w\)\)/);
  assert.match(royal, /\.game-screen \.cards-row \.selection-hand-img,\s*\.game-screen \.cards-row \.inspection-hand\s*\{[^}]*z-index:\s*80/);
  assert.match(royal, /\.game-screen::before\s*\{\s*content:\s*none/);
  assert.ok(!royal.includes("greek-key-corner.png"), "the frame uses no PNG corners");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
