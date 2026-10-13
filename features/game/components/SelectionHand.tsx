import Image from "next/image";

import { ARC_DROP, CARD_PITCH, cardFanContact, cardFanSlot } from "@/features/game/logic/cardFan";
import { pointingHandPose } from "../logic/tablePerspective";

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

export function SelectionHand({
  index,
  cardCount,
  settled = false,
  faint = false,
  roaming = false,
  mirrored = false,
  opposite = false,
  fromOpponent = false,
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
  /** Inverted deck. The pointer's owner still determines its screen side. */
  opposite?: boolean;
  fromOpponent?: boolean;
}) {
  if (index === null) return null;

  // `index` is identity, so translate it into the slot it is painted in before
  // asking the fan where that slot sits.
  const slot = mirrored ? cardCount - 1 - index : index;
  const { x, y, rotate } = cardFanSlot(slot, cardCount);
  const pose = pointingHandPose(opposite, fromOpponent);
  const contact = cardFanContact(slot, cardCount, pose.contact);

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
      src="/gauntlet-hand.png"
      alt=""
      width={929}
      height={1694}
      unoptimized
      aria-hidden="true"
      style={
        {
          "--hand-x": `calc(${x / CARD_PITCH} * var(--card-pitch, ${CARD_PITCH}px))`,
          "--hand-y": `calc(${y / ARC_DROP} * var(--fan-drop, ${ARC_DROP}px))`,
          "--hand-tilt": `${rotate}deg`,
          "--gauntlet-facing": pose.facing,
          "--gauntlet-contact-x": `calc(${contact.x} * var(--fan-card-h, 112px))`,
          "--gauntlet-contact-y": `calc(${contact.y} * var(--fan-card-h, 112px))`,
          "--roam-span": `calc(${(cardCount - 1) / 2} * var(--card-pitch, ${CARD_PITCH}px))`,
        } as React.CSSProperties
      }
    />
  );
}
