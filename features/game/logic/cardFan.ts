/**
 * Curved card layout.
 *
 * Pure geometry for the fanned card row: given a logical card index it returns
 * where that card should sit, how far it should rotate, and how it stacks. No
 * DOM, no React — the same function drives the CSS custom properties and the
 * selection hand, so the two can never disagree about where a card is.
 *
 * TWO RULES GOVERN EVERYTHING HERE:
 *
 * 1. `index` IS IDENTITY. A card's index is the value the game logic acts on.
 *    Mirroring changes only the ORDER cards are painted in, never which index a
 *    screen slot resolves to — see `slotToIndex` / `indexToSlot`.
 * 2. THE ARC IS SYMMETRIC. The centre card sits highest and each step toward an
 *    edge drops lower and rotates further, so the row reads as a physical fan
 *    rather than five cards on a line.
 */

/** Reference dimensions; the live board scales width and pitch in CSS. */
export const CARD_WIDTH = 61;

/** Card height, derived from the same 884:1624 aspect ratio the CSS uses. */
export const CARD_HEIGHT = Math.round((CARD_WIDTH * 1624) / 884);

/** Horizontal centre-to-centre spacing. Chosen so five cards fit a 320px viewport. */
export const CARD_PITCH = 43;

/** Vertical drop of the outermost card below the centre card, in px. */
export const ARC_DROP = 48;

/**
 * Rotation of the outermost card, in degrees; negated on the left edge.
 * Kept small on purpose: the director wants a GENTLE curve, not a strong fan.
 */
export const ARC_TILT = 9;

export interface CardFanSlot {
  /** Horizontal offset from the row centre, in px. */
  x: number;
  /** Vertical offset from the row centre, in px (positive = lower on screen). */
  y: number;
  /** Rotation in degrees. */
  rotate: number;
  /** Scale; the centre card is fractionally the largest, which reads as nearest. */
  scale: number;
  /** Paint order. Higher sits on top. */
  z: number;
}

/**
 * Map a logical card index to its left-to-right screen slot.
 *
 * Mirrored means "seen from the other side of the table": the row is painted in
 * reverse, so the player sitting opposite sees the same physical arrangement.
 * The index is untouched — a card keeps its identity; it only moves house.
 */
export function indexToSlot(index: number, count: number, mirrored = false): number {
  return mirrored ? count - 1 - index : index;
}

/**
 * Inverse of `indexToSlot`: which logical card occupies a given screen slot.
 *
 * Callers that translate a pointer position back into a card must go through
 * this, so the mirror can never desynchronise a tap from the card it selects.
 */
export function slotToIndex(slot: number, count: number, mirrored = false): number {
  return mirrored ? count - 1 - slot : slot;
}

/**
 * The layout for one card.
 *
 * `slot` is the left-to-right paint position (see `indexToSlot`), NOT the
 * logical index, so a mirrored row lays out identically and only the order the
 * cards are painted in changes.
 *
 * Offsets are symmetric about the centre, so a mirrored row is the exact
 * horizontal mirror of the unmirrored one.
 */
export function cardFanSlot(slot: number, count: number): CardFanSlot {
  if (count <= 1) return { x: 0, y: 0, rotate: 0, scale: 1, z: 1 };

  const centre = (count - 1) / 2;
  // -1 at the left edge, 0 dead centre, +1 at the right edge.
  const t = (slot - centre) / centre;
  // Gentle tilt: 3° for the 2-card duel, 6° for 3 cards, 9° for 5 cards.
  const tilt = count <= 2 ? 3 : count <= 3 ? 6 : ARC_TILT;
  const depth = count <= 2 ? .3 : count <= 3 ? .55 : 1;

  return {
    x: (slot - centre) * CARD_PITCH,
    // A parabola: flat at the centre, falling away toward both edges. Squaring t
    // keeps the middle cards level with each other and puts the bend in the ends.
    y: ARC_DROP * depth * t * t,
    rotate: tilt * t,
    // Nearest-to-the-viewer reads as largest; 4% is enough to feel like depth
    // without the row looking like it steps in size.
    scale: 1 - 0.04 * Math.abs(t),
    // PAINT ORDER PEAKS AT THE CENTRE, like a hand of cards actually fanned.
    //
    // This is load-bearing for tapping, not decoration. If z simply ascended
    // left to right, every card would be buried under the ones to its right and
    // the outer cards would have no exposed area left to hit. Peaking at the
    // centre means each card is covered only by the cards INWARD of it, so every
    // card keeps an exposed outer strip — which is the part a player taps.
    //
    // Offset by 10 so the row's own children sit above the stage background
    // instead of relying on DOM order for the base layer.
    z: 10 + count - Math.abs(slot - centre),
  };
}

/**
 * The full row, left to right.
 *
 * `mirrored` only reverses the paint order, so the returned array is always in
 * screen order and its i-th entry is the slot that appears i-th from the left.
 */
export function cardFan(count: number): CardFanSlot[] {
  return Array.from({ length: count }, (_, slot) => cardFanSlot(slot, count));
}

/** Contact at a fraction of the card's height, after its fan rotation/scale.
 * Coordinates are fractions of the live card height, relative to its slot.
 * Defaults to the pointing finger's 70% contact; the dealer uses 25%.
 */
export function cardFanContact(slot: number, count: number, fraction = .7): { x: number; y: number } {
  const { rotate, scale } = cardFanSlot(slot, count);
  const radians = rotate * Math.PI / 180;
  const offset = fraction - .5;
  return { x: -offset * Math.sin(radians) * scale, y: .5 + offset * Math.cos(radians) * scale };
}

/** CSS custom properties for one card, ready to spread onto a `style`. */
export function cardFanStyle(slot: number, count: number): Record<string, string> {
  const { x, y, rotate, scale, z } = cardFanSlot(slot, count);
  return {
    "--fan-slot": `${slot}`,
    "--fan-overlap-step": slot === 0 ? "0" : "1",
    "--fan-x": `${x}px`,
    "--fan-y": `calc(${y / ARC_DROP} * var(--fan-drop, ${ARC_DROP}px))`,
    "--fan-rotate": `${rotate}deg`,
    "--fan-scale": `${scale}`,
    "--fan-z": `${z}`,
  };
}