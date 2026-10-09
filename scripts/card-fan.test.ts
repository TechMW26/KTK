/**
 * Card-fan geometry and identity mapping.
 *
 * Run:  node --experimental-strip-types scripts/card-fan.test.ts
 *
 * The mirroring assertions matter most. Mirroring is a PAINT-ORDER change, and
 * the danger is that a screen slot stops matching the logical card the game
 * logic expects. These tests pin both directions of that mapping so a tap can
 * never select the wrong card.
 */
import assert from "node:assert/strict";

import {
  ARC_DROP,
  ARC_TILT,
  CARD_PITCH,
  CARD_WIDTH,
  cardFan,
  cardFanContact,
  cardFanSlot,
  cardFanStyle,
  indexToSlot,
  slotToIndex,
} from "../features/game/logic/cardFan.ts";

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

console.log("card-fan.test — curved layout and mirrored identity");

check("fingertip follows the lower card face after rotation and scale", () => {
  for (const count of [2, 3, 5]) {
    for (let index = 0; index < count; index++) {
      for (const mirrored of [false, true]) {
        const slot = indexToSlot(index, count, mirrored);
        const contact = cardFanContact(slot, count);
        const { rotate, scale } = cardFanSlot(slot, count);
        const angle = rotate * Math.PI / 180;
        // Undo the actual card transform: contact must be on its centreline,
        // 70% down its face, including mirrored edge cards.
        const localX = (contact.x * Math.cos(angle) + (contact.y - .5) * Math.sin(angle)) / scale;
        const localY = (-contact.x * Math.sin(angle) + (contact.y - .5) * Math.cos(angle)) / scale + .5;
        assert.ok(Math.abs(localX) < 1e-10);
        assert.ok(Math.abs(localY - .7) < 1e-10);
      }
    }
  }
});

check("the centre card sits highest and the edges drop below it", () => {
  const row = cardFan(5);
  const centre = row[2];
  assert.equal(centre.y, 0, "the centre card must be the high point");
  assert.ok(row[0].y > centre.y, "the left edge must sit lower than the centre");
  assert.ok(row[4].y > centre.y, "the right edge must sit lower than the centre");
  assert.equal(row[0].y, ARC_DROP, "the outermost card drops by ARC_DROP");
  assert.ok(row[1].y < row[0].y, "the drop must grow toward the edge");
});

check("the arc is symmetric about the centre", () => {
  const row = cardFan(5);
  assert.equal(row[0].y, row[4].y, "left and right edges must match");
  assert.equal(row[1].y, row[3].y, "second cards in must match");
  assert.equal(row[0].x, -row[4].x, "x offsets must be mirrored");
  assert.equal(row[0].rotate, -row[4].rotate, "rotations must be mirrored");
});

check("cards rotate progressively outward", () => {
  const row = cardFan(5);
  assert.equal(row[2].rotate, 0, "the centre card is upright");
  assert.equal(row[0].rotate, -ARC_TILT);
  assert.equal(row[4].rotate, ARC_TILT);
  assert.ok(row[0].rotate < row[1].rotate, "tilt must increase toward the edge");
});

check("nearest card is largest", () => {
  const row = cardFan(5);
  assert.ok(row[2].scale > row[1].scale, "the centre card is the largest");
  assert.ok(row[1].scale > row[0].scale, "scale falls toward the edge");
  assert.equal(row[0].scale, row[4].scale, "scale is symmetric");
});

check("spacing is uniform, so the row reads as an even fan", () => {
  const row = cardFan(5);
  for (let i = 1; i < row.length; i += 1) {
    assert.equal(row[i].x - row[i - 1].x, CARD_PITCH, `gap after card ${i - 1}`);
  }
});

check("five 61px cards fit the 320px viewport with overlap", () => {
  const pitch = CARD_PITCH;
  const rowWidth = CARD_WIDTH + pitch * 4;
  // The stage's usable width on a 320px screen, per globals.css padding chain.
  const usable = 234;
  assert.ok(rowWidth <= usable, `row ${rowWidth}px must fit ${usable}px`);
  assert.ok(pitch > 0, "cards must advance, never stack in place");
  // Each card keeps a front strip at least as wide as the pitch.
  assert.ok(pitch >= 40, `exposed strip ${pitch}px is too narrow to tap reliably`);
});

check("mirroring reverses paint order but preserves every index", () => {
  const count = 5;
  // Unmirrored: slot i holds card i.
  for (let i = 0; i < count; i += 1) assert.equal(slotToIndex(i, count, false), i);
  // Mirrored: the row is painted in reverse.
  for (let i = 0; i < count; i += 1) assert.equal(slotToIndex(i, count, true), count - 1 - i);
});

check("indexToSlot and slotToIndex are inverses, mirrored or not", () => {
  for (const mirrored of [false, true]) {
    for (let i = 0; i < 5; i += 1) {
      const slot = indexToSlot(i, 5, mirrored);
      assert.equal(
        slotToIndex(slot, 5, mirrored),
        i,
        `index ${i} (mirrored=${mirrored}) must round-trip`,
      );
    }
  }
});

check("mirroring never changes the set of indices, only their order", () => {
  const count = 5;
  const plain = Array.from({ length: count }, (_, i) => slotToIndex(i, count, false));
  const mirrored = Array.from({ length: count }, (_, i) => slotToIndex(i, count, true));
  assert.deepEqual([...plain].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
  assert.deepEqual([...mirrored].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
  assert.notDeepEqual(plain, mirrored, "the orders must actually differ");
});

check("a mirrored row is the horizontal mirror of the plain row", () => {
  const count = 5;
  // `-0` and `0` are different under strict equality but identical on screen, so
  // normalise before comparing.
  const norm = (n: number) => (n === 0 ? 0 : n);
  for (let slot = 0; slot < count; slot += 1) {
    const index = slotToIndex(slot, count, true);
    // The card at mirrored slot i sits where its index would sit unmirrored.
    assert.equal(norm(cardFanSlot(slot, count).x), norm(-cardFanSlot(index, count).x));
  }
});

check("the layout holds for the 3-card court too", () => {
  const row = cardFan(3);
  assert.equal(row.length, 3);
  assert.equal(row[1].y, 0, "the centre card is the high point");
  assert.ok(row[0].y > 0 && row[2].y > 0);
  assert.equal(row[0].rotate, -row[2].rotate);
});

check("a single card sits flat and centred", () => {
  const only = cardFanSlot(0, 1);
  assert.deepEqual(only, { x: 0, y: 0, rotate: 0, scale: 1, z: 1 });
});

check("emitted style carries the geometry as CSS custom properties", () => {
  const style = cardFanStyle(4, 5);
  assert.equal(style["--fan-x"], `${2 * CARD_PITCH}px`);
  assert.equal(style["--fan-y"], `calc(1 * var(--fan-drop, ${ARC_DROP}px))`);
  assert.equal(style["--fan-rotate"], `${ARC_TILT}deg`);
  assert.ok(style["--fan-z"]);
});

check("paint order peaks at the centre, so every card keeps a tappable strip", () => {
  const row = cardFan(5);
  // The centre card is on top; z falls away toward both edges.
  assert.ok(row[2].z > row[1].z && row[2].z > row[3].z, "the centre card must paint on top");
  assert.ok(row[0].z < row[1].z, "the left edge must paint under its neighbour");
  assert.ok(row[4].z < row[3].z, "the right edge must paint under its neighbour");
  // Symmetric, so the fan reads evenly from both sides.
  assert.equal(row[0].z, row[4].z);
  assert.equal(row[1].z, row[3].z);
  // Each card is covered only by the cards INWARD of it, which is what leaves an
  // exposed outer strip to tap. Ascending z (the bug this guards) buries the
  // outer cards entirely.
  assert.ok(row[0].z > 0, "the outermost card must still paint above the row");
});

check("mirrored DOM order and overlap follow screen slots in every court", () => {
  for (const count of [2, 3, 5]) {
    for (const mirrored of [false, true]) {
      const painted = Array.from({ length: count }, (_, index) => ({ index, style: cardFanStyle(indexToSlot(index, count, mirrored), count) }))
        .sort((a, b) => Number(a.style["--fan-slot"]) - Number(b.style["--fan-slot"]));
      assert.deepEqual(painted.map(c => c.index), Array.from({ length: count }, (_, slot) => slotToIndex(slot, count, mirrored)));
      assert.equal(painted[0].style["--fan-overlap-step"], "0");
      assert.ok(painted.slice(1).every(c => c.style["--fan-overlap-step"] === "1"));
    }
  }
});

check("small courts use a gentler symmetric fan", () => {
  assert.equal(cardFanSlot(0, 2).rotate, -6);
  assert.equal(cardFanSlot(1, 2).rotate, 6);
  assert.equal(cardFanSlot(0, 3).rotate, -10);
  assert.equal(cardFanSlot(2, 3).rotate, 10);
  assert.ok(cardFanSlot(0, 2).y < cardFanSlot(0, 3).y);
  assert.ok(cardFanSlot(0, 3).y < cardFanSlot(0, 5).y);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
