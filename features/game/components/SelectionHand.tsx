import Image from "next/image";

/**
 * The hand that hovers over the card row.
 *
 * Purely presentational: it shows WHERE attention is, which is why every variant
 * is a visual modifier rather than a behaviour.
 *
 * The horizontal offset is computed from the card index so the hand lines up
 * with a real card. `76` is the card pitch in CSS — if the card geometry changes,
 * this and `.selection-hand-img` must change together.
 */

/** Horizontal distance between adjacent cards, in px. Must match the CSS pitch. */
const CARD_PITCH = 76;

/** Half-pitch of the row, used to size the roaming sweep. */
const HALF_PITCH = 38;

export function SelectionHand({
  index,
  cardCount,
  settled = false,
  faint = false,
  roaming = false,
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
}) {
  if (index === null) return null;

  const offset = index - (cardCount - 1) / 2;

  return (
    <Image
      className={[
        "selection-hand-img",
        settled ? "settled" : "",
        faint ? "faint" : "",
        roaming ? "roaming" : "",
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
          "--hand-x": `${offset * CARD_PITCH}px`,
          "--roam-span": `${(cardCount - 1) * HALF_PITCH}px`,
        } as React.CSSProperties
      }
    />
  );
}
