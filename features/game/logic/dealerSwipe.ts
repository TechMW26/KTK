import { DEAL_RELEASE_SPAN_FRACTION, DEAL_START_FRACTION } from "../constants/pacing.ts";

export const DEALER_ART = { width: 728, height: 2161, anchorX: .5, anchorY: .8 };
export const DEALER_TOP_BUFFER = 96;
export interface DealContact { x: number; y: number }

/** Real card contacts in screen order; the arm's upper edge stays offscreen.
 * The sprite is never stretched: a minimum height supplies hidden forearm
 * buffer even on a short phone or when the fan is placed low on the table.
 */
export function dealerSwipePlan(contacts: DealContact[], cardWidth: number) {
  const tilt = 4 * Math.PI / 180;
  // Rotation raises one corner of the cropped forearm edge. Account for its
  // full width, so even that corner keeps the entire hidden buffer.
  const hiddenReach = DEALER_ART.anchorY * Math.cos(tilt)
    - DEALER_ART.width / DEALER_ART.height * .5 * Math.sin(tilt);
  const height = Math.max(cardWidth * 1.4 * DEALER_ART.height / DEALER_ART.width,
    (Math.max(...contacts.map(p => p.y)) + DEALER_TOP_BUFFER) / hiddenReach);
  const width = height * DEALER_ART.width / DEALER_ART.height;
  const first = contacts[0], last = contacts[contacts.length - 1];
  const transform = (p: DealContact, angle = 0) =>
    `translate(${p.x - width * DEALER_ART.anchorX}px, ${p.y - height * DEALER_ART.anchorY}px) rotate(${angle}deg)`;
  const frames = [
    { offset: 0, opacity: 0, transform: transform({ x: first.x - 32, y: -height }) },
    { offset: .14, opacity: 1, transform: transform({ x: first.x - 24, y: first.y - 52 }, -4), easing: "ease-out" },
    ...contacts.map((p, slot) => ({
      offset: DEAL_START_FRACTION + DEAL_RELEASE_SPAN_FRACTION * (contacts.length === 1 ? .5 : slot / (contacts.length - 1)),
      opacity: 1, transform: transform(p, -4 + 8 * (contacts.length === 1 ? .5 : slot / (contacts.length - 1))), easing: "linear",
    })),
    { offset: .84, opacity: 1, transform: transform({ x: last.x + 16, y: last.y - 36 }, 3), easing: "cubic-bezier(.45,0,.8,.4)" },
    { offset: 1, opacity: 0, transform: transform({ x: last.x + 40, y: -height }) },
  ];
  return { width, height, frames };
}
