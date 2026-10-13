import Image from "next/image";

import { ARC_DROP, CARD_PITCH, cardFanContact, cardFanSlot } from "@/features/game/logic/cardFan";
import { pointingHandPose } from "../logic/tablePerspective";

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
 * `mirrored` reverses the slot and card lift. The hand's owner determines its
 * screen side: the local player points up from below; the rival points down
 * from above, independently of the deck orientation.
 *
 * Purely visual: `pointer-events: none`, so it can never steal a tap.
 */
export function InspectionVisual({
  index,
  cardCount,
  mirrored = false,
  remote = false,
  opposite = false,
}: {
  /** Card index being inspected, or null to render nothing. */
  index: number | null;
  cardCount: number;
  /** Render as the OTHER player's hand (recessed, never interactive). */
  remote?: boolean;
  /** The view is mirrored (this client is seat 1). */
  mirrored?: boolean;
  opposite?: boolean;
}) {
  if (index === null || cardCount <= 0) return null;

  // `index` is the card's IDENTITY; translate it into the slot it is painted in
  // before asking the fan where that slot sits (same rule the cards use).
  const slot = mirrored ? cardCount - 1 - index : index;
  const { x, y, rotate } = cardFanSlot(slot, cardCount);
  const pose = pointingHandPose(opposite, remote);
  const contact = cardFanContact(slot, cardCount, pose.contact);

  return (
    <Image
      className={["inspection-hand", remote ? "remote" : ""].filter(Boolean).join(" ")}
      src="/gauntlet-hand.png"
      alt=""
      width={929}
      height={1694}
      unoptimized
      aria-hidden="true"
      style={
        {
          "--inspect-x": `calc(${x / CARD_PITCH} * var(--card-pitch, ${CARD_PITCH}px))`,
          "--inspect-y": `calc(${y / ARC_DROP} * var(--fan-drop, ${ARC_DROP}px))`,
          "--inspect-tilt": `${rotate}deg`,
          "--gauntlet-facing": pose.facing,
          "--gauntlet-contact-x": `calc(${contact.x} * var(--fan-card-h, 112px))`,
          "--gauntlet-contact-y": `calc(${contact.y} * var(--fan-card-h, 112px))`,
          // +1 = the inspecting player is at the bottom of THIS screen; -1 = the
          // row is mirrored, so "toward the player" is up.
          "--inspect-dir": mirrored ? -1 : 1,
        } as React.CSSProperties
      }
    />
  );
}
