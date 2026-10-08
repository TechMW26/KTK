import Image from "next/image";

import { cardFanSlot } from "@/features/game/logic/cardFan";

/**
 * The hand that hovers over the card row.
 *
 * Purely presentational: it shows WHERE attention is, which is why every variant
 * is a visual modifier rather than a behaviour.
 *
 * The offset is read from the SAME layout the cards use
 * (`features/game/logic/cardFan.ts`), so the hand can never drift out of
 * alignment with a card when the arc geometry is tuned. It also rides the arc
 * vertically, so it lands on the card rather than beside it.
 */

/** Half-pitch of the row, used to size the roaming sweep. */
const HALF_PITCH = 22;

export function SelectionHand({
  index,
  cardCount,
  settled = false,
  faint = false,
  roaming = false,
  mirrored = false,
}: {
  /** Card the hand points at, or null to hide the hand entirely. */
  index: number | null;
  cardCount: number;
  /** Play the press-down animation (used at the reveal). */
  settled?: boolean;
  /** Dim the hand — the pick belongs to the opponent. */
  faint?: boolean;
  /** Sweep slowly from side to side while the opponent deliberates. */
  roaming?: boolean;
  /** Point from the opposite side of the table, matching the mirrored row. */
  mirrored?: boolean;
}) {
  if (index === null) return null;

  // `index` is identity, so translate it into the slot it is painted in before
  // asking the fan where that slot sits.
  const slot = mirrored ? cardCount - 1 - index : index;
  const { x, y, rotate } = cardFanSlot(slot, cardCount);

  return (
    <Image
      className={[
        "selection-hand-img",
        settled ? "settled" : "",
        faint ? "faint" : "",
        roaming ? "roaming" : "",
        mirrored ? "mirrored" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      src="/guesser-hand.png"
      alt=""
      width={928}
      height={1695}
      unoptimized
      aria-hidden="true"
      style={
        {
          "--hand-x": `${x}px`,
          "--hand-y": `${y}px`,
          "--hand-tilt": `${rotate}deg`,
          "--roam-span": `${(cardCount - 1) * HALF_PITCH}px`,
        } as React.CSSProperties
      }
    />
  );
}
