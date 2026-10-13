import assert from "node:assert/strict";
import { dealerSwipePlan, DEALER_ART, DEALER_TOP_BUFFER } from "../features/game/logic/dealerSwipe.ts";
import { dealTimings, SHUFFLE_MS, REDUCED } from "../features/game/constants/pacing.ts";
import { cardFanContact, cardFanSlot, indexToSlot } from "../features/game/logic/cardFan.ts";
import { oppositePoint, oppositeRowOffset, pointingHandPose } from "../features/game/logic/tablePerspective.ts";

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
for (const opposite of [false,true]) {
  for (const fromOpponent of [false,true]) {
    const pose = pointingHandPose(opposite,fromOpponent);
    const globalContact = opposite ? 1-pose.contact : pose.contact;
    assert.ok(Math.abs(globalContact-(fromOpponent ? .3 : .7))<1e-9,"opponent touches the upper face, user touches the lower face");
    assert.equal(((opposite?180:0)+parseFloat(pose.facing))%360,fromOpponent?180:0,"rival hand comes from the top and user's from the bottom in either deck orientation");
    checks++;
  }
}
for (const [width,height] of [[320,640],[402,874],[640,360]]) {
  for (const count of [2,3,5]) {
    const top = height * .25, rowHeight = height * .55;
    const offset = oppositeRowOffset(height,top,rowHeight);
    const contacts = Array.from({length:count},(_,slot)=>({x:width*.15+slot*width*.7/(count-1),y:top+20}));
    const inverted = contacts.map(p=>oppositePoint(p,width,height));
    const normalPlan = dealerSwipePlan(contacts,70);
    const bottomPlan = dealerSwipePlan(inverted.map(p=>oppositePoint(p,width,height)),70);
    assert.ok(Math.abs(bottomPlan.height-normalPlan.height)<1e-9);
    assert.ok(Math.abs(bottomPlan.width-normalPlan.width)<1e-9);
    bottomPlan.frames.forEach((frame,i)=>{
      const source = normalPlan.frames[i];
      assert.equal(frame.offset,source.offset); assert.equal(frame.opacity,source.opacity);
      const numbers = (s:string) => s.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      numbers(frame.transform).forEach((value,j)=>assert.ok(Math.abs(value-numbers(source.transform)[j])<1e-9,"bottom path is the same top path reflected through the board"));
    });
    for (let slot=0;slot<count;slot++) {
      const p = contacts[slot], bottom = inverted[slot];
      assert.equal(height-bottom.y,p.y,"card release distance is identical from either screen edge");
      const restored = oppositePoint(bottom,width,height);
      assert.ok(Math.abs(restored.x-p.x)<1e-9 && Math.abs(restored.y-p.y)<1e-9,"card contacts survive a round trip between perspectives");
      const localY = p.y-top;
      assert.ok(Math.abs(top+offset+rowHeight-localY-bottom.y)<1e-9,"row rotation aligns the same contact without moving the HUD");
    }
    checks++;
  }
}
console.log(`dealer-swipe.test — ${checks + 1} timing, geometry, and mirrored-order scenarios passed`);
