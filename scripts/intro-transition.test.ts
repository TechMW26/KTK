import assert from "node:assert/strict";
import {
  APP_EMBLEM, INTRO_FRAME, INTRO_SESSION_KEY, VIDEO_EMBLEM,
  claimSessionIntro, logoBoxTransform, registeredLogoBox,
} from "../features/game/logic/introTransition.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} ≠ ${expected}`);
let checks = 0;
for (const [width, height, fit] of [
  [320, 640, "cover"], [390, 844, "cover"], [430, 932, "cover"],
  [1280, 720, "contain"], [640, 360, "contain"],
] as const) {
  const viewport = { left: 0, top: 0, width, height };
  const box = registeredLogoBox(viewport, fit);
  const s = fit === "cover" ? Math.max(width / INTRO_FRAME.width, height / INTRO_FRAME.height) : Math.min(width / INTRO_FRAME.width, height / INTRO_FRAME.height);
  // Actual opaque emblem bounds must match the clip after letterboxing/cropping.
  close(box.left + APP_EMBLEM.left * box.width / APP_EMBLEM.canvas, (width - INTRO_FRAME.width * s) / 2 + VIDEO_EMBLEM.left * s);
  close(box.top + APP_EMBLEM.top * box.height / APP_EMBLEM.canvas, (height - INTRO_FRAME.height * s) / 2 + VIDEO_EMBLEM.top * s);
  close(APP_EMBLEM.width * box.width / APP_EMBLEM.canvas, VIDEO_EMBLEM.width * s);
  close(APP_EMBLEM.height * box.height / APP_EMBLEM.canvas, VIDEO_EMBLEM.height * s);
  // Handoff is computed from the real destination, not a fixed screen location.
  const target = { left: width / 2 - 100, top: height * .23, width: 200, height: 200 };
  const [sx, , , sy, tx, ty] = logoBoxTransform(box, target).slice(7, -1).split(",").map(Number);
  close(box.left + tx, target.left);
  close(box.top + ty, target.top);
  close(box.width * sx, target.width);
  close(box.height * sy, target.height);
  checks++;
}
const values = new Map<string, string>();
const session = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
assert.equal(claimSessionIntro(session), true, "first mount plays");
assert.equal(values.get(INTRO_SESSION_KEY), "1", "reserve before video starts");
assert.equal(claimSessionIntro(session), false, "Strict Mode/remount cannot replay");
assert.equal(claimSessionIntro(session), false, "page reload keeps the session flag");
assert.equal(claimSessionIntro({ getItem: () => { throw new Error("denied"); }, setItem: () => {} }), false, "denied storage does not cause a replay");
assert.equal(claimSessionIntro(), false, "document fallback preserves the claim");
console.log(`intro-transition: ${checks} responsive registrations and session replay guards passed`);
