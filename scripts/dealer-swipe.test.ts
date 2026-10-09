import assert from "node:assert/strict";
import { dealerSwipePlan, DEALER_ART, DEALER_TOP_BUFFER } from "../features/game/logic/dealerSwipe.ts";
import { dealTimings, SHUFFLE_MS, REDUCED } from "../features/game/constants/pacing.ts";
import { cardFanContact, cardFanSlot, indexToSlot } from "../features/game/logic/cardFan.ts";

let checks = 0;
for (const count of [2, 3, 5]) {
  for (const windowMs of [SHUFFLE_MS, REDUCED.shuffle]) {
    const timing = dealTimings(count, windowMs);
    for (const mirrored of [false, true]) {
      const slots = Array.from({ length: count }, (_, index) => indexToSlot(index, count, mirrored));
      const releases = slots.map(slot => timing.launch(slot));
      assert.equal(new Set(releases).size, count, "every card gets its own release beat");
      assert.ok(timing.land(count - 1) <= windowMs / 1000 * .84 + 1e-10, "all cards settle before withdrawal");
      assert.equal(timing.total * 1000, windowMs, "phase clock includes full withdrawal");
      checks++;
    }
  }
  for (const cardWidth of [70, 140, 220]) {
    for (const contactY of [180, 380, 680]) {
      const contacts = Array.from({ length: count }, (_, slot) => ({ x: 20 + slot * 75, y: contactY }));
      const plan = dealerSwipePlan(contacts, cardWidth);
      assert.ok(Math.abs(plan.width / plan.height - DEALER_ART.width / DEALER_ART.height) < 1e-10);
      assert.ok(plan.width >= cardWidth * 1.4 - 1e-10, "hand remains proportionate to the cards");
      assert.equal(plan.frames[0].opacity, 0);
      assert.equal(plan.frames.at(-1)!.opacity, 0);
      for (let slot = 0; slot < count; slot++) {
        const frame = plan.frames[slot + 2];
        assert.ok(Math.abs(frame.offset! - dealTimings(count).launch(slot) / (SHUFFLE_MS / 1000)) < 1e-10,
          "hand contact and card release use the same clock");
        const angle = (-4 + 8 * slot / (count - 1)) * Math.PI / 180;
        const bottomOfTopEdge = contactY - plan.height * DEALER_ART.anchorY * Math.cos(angle)
          + plan.width / 2 * Math.abs(Math.sin(angle));
        assert.ok(bottomOfTopEdge <= -DEALER_TOP_BUFFER + 1e-10, "even the rotated forearm cut retains the full hidden buffer");
      }
      checks++;
    }
  }
  for (let slot = 0; slot < count; slot++) {
    const { rotate, scale } = cardFanSlot(slot, count);
    const p = cardFanContact(slot, count, .25);
    const angle = rotate * Math.PI / 180;
    const localY = (-p.x * Math.sin(angle) + (p.y - .5) * Math.cos(angle)) / scale + .5;
    assert.ok(Math.abs(localY - .25) < 1e-10, "palm targets the upper quarter of each tilted card");
    checks++;
  }
}
assert.ok(SHUFFLE_MS < 2200, "normal animation fits the multiplayer shuffle grace period");
console.log(`dealer-swipe.test — ${checks + 1} timing, geometry, and mirrored-order scenarios passed`);
