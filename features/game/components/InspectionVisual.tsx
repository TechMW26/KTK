import Image from "next/image";

import { cardFanSlot } from "@/features/game/logic/cardFan";

/**
 * The physical "a hand picks up a card and inspects it" overlay.
 *
 * Rendered INSIDE a `.cards-row` and absolutely positioned over the row, so it
 * rides the exact same geometry (`cardFanSlot`) the cards use. That is what keeps
 * the hand glued to its card when the canonical board scales — there are no
 * device-specific coordinates anywhere, only the fan's own offsets.
 *
 * It draws only the HAND; the lift of the card itself is applied to the card
 * element via the `card-inspected` class, so the card stays a real, positioned
 * member of the row rather than a detached copy.
 *
 * The same component serves both seats:
 *   - the local acting player sees their own hand (dir = toward them);
 *   - the opponent sees it as `remote`, a hair recessed.
 * `mirrored` flips the slot lookup and the vertical direction together, because
 * seat 1 sees the row (and therefore "toward me") reversed.
 *
 * Purely visual: `pointer-events: none`, so it can never steal a tap.
 */
export function InspectionVisual({
  index,
  cardCount,
  mirrored = false,
  remote = false,
}: {
  /** Card index being inspected, or null to render nothing. */
  index: number | null;
  cardCount: number;
  /** Render as the OTHER player's hand (recessed, never interactive). */
  remote?: boolean;
  /** The view is mirrored (this client is seat 1). */
  mirrored?: boolean;
}) {
  if (index === null || cardCount <= 0) return null;

  // `index` is the card's IDENTITY; translate it into the slot it is painted in
  // before asking the fan where that slot sits (same rule the cards use).
  const slot = mirrored ? cardCount - 1 - index : index;
  const { x, y, rotate } = cardFanSlot(slot, cardCount);

  return (
    <Image
      className={["inspection-hand", remote ? "remote" : ""].filter(Boolean).join(" ")}
      src="/guesser-hand.png"
      alt=""
      width={928}
      height={1695}
      unoptimized
      aria-hidden="true"
      style={
        {
          "--inspect-x": `${x}px`,
          "--inspect-y": `${y}px`,
          "--inspect-tilt": `${rotate}deg`,
          // +1 = the inspecting player is at the bottom of THIS screen; -1 = the
          // row is mirrored, so "toward the player" is up.
          "--inspect-dir": mirrored ? -1 : 1,
        } as React.CSSProperties
      }
    />
  );
}
