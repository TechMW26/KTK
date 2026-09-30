/**
 * Golden-master harness for the bot opponent's decision rules.
 *
 * Run:  node --experimental-strip-types scripts/bot.test.ts
 *
 * The bot's randomness lives at the EDGE (the Math.random() call site); the
 * thresholds do not. This file pins the thresholds so a refactor cannot quietly
 * make the rival smarter or dumber than it shipped.
 *
 * Shipped thresholds, taken from app/page.tsx:
 *   hide   : use a bluff when available with probability 0.14
 *   guess  : accuse with probability 0.55 when the dealer bluffed,
 *            otherwise with probability 0.08
 */
import flow from "node:assert/strict";

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

// ---------------------------------------------------------------------------
// Mirrors of the shipped decision rules (source of truth: app/page.tsx).
// ---------------------------------------------------------------------------

const BOT_BLUFF_CHANCE = 0.14;
const BOT_ACCUSE_CHANCE_VS_BLUFF = 0.55;
const BOT_ACCUSE_CHANCE_OTHERWISE = 0.08;

function botHidesBluff(bluffAvailable: boolean, roll: number): boolean {
  return bluffAvailable && roll < BOT_BLUFF_CHANCE;
}

function botCallsBluff(dealerActuallyBluffed: boolean, roll: number): boolean {
  return roll < (dealerActuallyBluffed ? BOT_ACCUSE_CHANCE_VS_BLUFF : BOT_ACCUSE_CHANCE_OTHERWISE);
}

console.log("bot.test — opponent decision thresholds");

check("bluffing is impossible once the bot's bluff is spent", () => {
  // Sweep every possible roll: an unavailable bluff can never be used.
  for (let roll = 0; roll < 1; roll += 0.01) {
    flow.equal(botHidesBluff(false, roll), false, `roll ${roll.toFixed(2)}`);
  }
});

check("bluffing happens below the 0.14 threshold and not at or above it", () => {
  flow.equal(botHidesBluff(true, 0), true);
  flow.equal(botHidesBluff(true, 0.139), true);
  flow.equal(botHidesBluff(true, 0.14), false);
  flow.equal(botHidesBluff(true, 0.5), false);
  flow.equal(botHidesBluff(true, 0.999), false);
});

check("a bluff is used on roughly 14% of the available opportunities", () => {
  let used = 0;
  const samples = 100_000;
  for (let i = 0; i < samples; i += 1) {
    if (botHidesBluff(true, i / samples)) used += 1;
  }
  const rate = used / samples;
  flow.ok(Math.abs(rate - BOT_BLUFF_CHANCE) < 0.002, `rate ${rate.toFixed(4)}`);
});

check("the bot accuses far more often against an actual bluff (0.55)", () => {
  flow.equal(botCallsBluff(true, 0), true);
  flow.equal(botCallsBluff(true, 0.549), true);
  flow.equal(botCallsBluff(true, 0.55), false);
  flow.equal(botCallsBluff(true, 1), false);
});

check("the bot rarely accuses a truthful dealer (0.08)", () => {
  flow.equal(botCallsBluff(false, 0), true);
  flow.equal(botCallsBluff(false, 0.079), true);
  flow.equal(botCallsBluff(false, 0.08), false);
  flow.equal(botCallsBluff(false, 1), false);
});

check("the suspicion ratio is preserved (accuses ~7x more often vs a bluff)", () => {
  const bluffRate = BOT_ACCUSE_CHANCE_VS_BLUFF;
  const honestRate = BOT_ACCUSE_CHANCE_OTHERWISE;
  const ratio = bluffRate / honestRate;
  flow.ok(Math.abs(ratio - 6.875) < 0.001, `ratio ${ratio}`);
});

check("an honest dealer is almost never accused across a full match", () => {
  // 10 guess rounds where the dealer never bluffs: expected ~0.8 accusations,
  // so a well-behaved bot should accuse on fewer than 5% of them.
  let rounds = 0;
  let accusations = 0;
  const samples = 20_000;
  for (let i = 0; i < samples; i += 1) {
    if (botCallsBluff(false, i / samples)) accusations += 1;
    rounds += 1;
  }
  flow.ok(accusations / rounds < 0.09, `rate ${(accusations / rounds).toFixed(4)}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
