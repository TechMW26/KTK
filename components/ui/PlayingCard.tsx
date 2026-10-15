/**
 * A card on the table.
 *
 * One component serves every board state: face-down while guessing, face-up at
 * the reveal, shattered when the guesser picked wrong, blank when the dealer
 * bluffed. The visual differences are classes on the existing `.playing-card`
 * CSS — no gameplay meaning lives in here.
 *
 * Dimensions come from CSS (`aspect-ratio`), never from props, because the card
 * geometry is load-bearing for the hand and deal animations.
 *
 * The curved fan is OPT-IN. Pass `fanCount` (with `fanSlot` when the view is
 * mirrored) to lay the card out on the arc; omit them and the card behaves
 * exactly as it always has, in a straight flex row. `index` is identity and is
 * never affected by the fan — only `fanSlot` moves a card around the table.
 */

import { cardFanStyle } from "@/features/game/logic/cardFan";
import { Crown, Heart } from "lucide-react";

export interface PlayingCardProps {
  /** Seat-local card number; also used for the face-up rank and aria label. */
  index: number;
  /** Reveal the front face. */
  faceUp?: boolean;
  /** This card holds the King. */
  king?: boolean;
  /** The dealer bluffed, so there is no King anywhere — show an empty slot. */
  blank?: boolean;
  /** Currently picked by the guesser. */
  chosen?: boolean;
  /** Wrong pick: play the shatter effect. */
  wrong?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Pointer and keyboard focus both report hover, so the hand tracks either. */
  onHover?: (hovered: boolean) => void;
  /** Seconds to wait before this card lands during the deal. */
  dealDelay?: number;
  /** Seconds to wait before this card flips over at the reveal. */
  flipDelay?: number;
  /**
   * Left-to-right paint position in the fanned row. Defaults to `index`, which
   * is correct whenever the view is NOT mirrored; pass the mirrored slot when it
   * is. Supplying it switches the card into the curved layout.
   */
  fanSlot?: number;
  /** Number of cards in the row. Enables the curved layout when provided. */
  fanCount?: number;
  /** Play the "King is placed" beat. Ignored visually unless `fanCount` is set. */
  kingPlacing?: boolean;
  /** Play the "player pulls the card" beat. */
  pulling?: boolean;
  /**
   * This card is being physically inspected (hovered / aimed at) right now, so
   * it lifts toward its owner and stays fully lit while the rest of the row
   * rests. Presentation only — it is NOT a selection and never affects a rule.
   */
  inspected?: boolean;
  /**
   * The number PRINTED on the face (defaults to index + 1). A turned-around row
   * passes the left-to-right screen number so the face matches "CONFIRM CARD n".
   */
  number?: number;
}

export function PlayingCard({
  index,
  faceUp,
  king,
  blank,
  chosen,
  wrong,
  disabled,
  onClick,
  onHover,
  dealDelay,
  flipDelay,
  fanSlot,
  fanCount,
  kingPlacing,
  pulling,
  inspected,
  number,
}: PlayingCardProps) {
  const shown = number ?? index + 1;
  const className = [
    "playing-card",
    faceUp ? "face-up" : "",
    king ? "is-king" : "",
    chosen ? "chosen" : "",
    wrong ? "shattered" : "",
    kingPlacing ? "king-placing" : "",
    pulling ? "card-pulling" : "",
    inspected ? "card-inspected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = faceUp
    ? blank
      ? `Empty card ${shown}`
      : king
      ? `King in card ${shown}`
      : `Card ${shown}`
    : `Choose card ${shown}`;

  // The curve is opt-in: a call site that does not pass `fanCount` keeps the
  // original straight flex row exactly as before.
  const fanned = typeof fanCount === "number" && fanCount > 0;
  const slot = fanSlot ?? index;

  return (
    <button
      className={className}
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      style={
        {
          ...(dealDelay === undefined ? {} : { "--deal-delay": `${dealDelay}s` }),
          ...(flipDelay === undefined ? {} : { "--flip-delay": `${flipDelay}s` }),
          ...(fanned ? cardFanStyle(slot, fanCount) : {}),
        } as React.CSSProperties
      }
      disabled={disabled}
      aria-label={label}
      aria-pressed={Boolean(chosen)}
    >
      <span className="card-inner">
        <span className="card-back" aria-hidden="true" />
        <span className="card-front" data-face={blank ? "empty" : king ? "king" : "heart"} aria-hidden="true">
          {blank ? (
            <span className="card-face-label">EMPTY</span>
          ) : (
            <>
              <span className="corner-rank">
                {king ? "K" : shown}
                <small><Heart fill="currentColor" strokeWidth={1} /></small>
              </span>
              <span className="corner-rank corner-rank-bottom">
                {king ? "K" : shown}
                <small><Heart fill="currentColor" strokeWidth={1} /></small>
              </span>
              {king && <span className="card-face-label">THE KING</span>}
            </>
          )}
        </span>
      </span>
      {king && faceUp && (
        <span className="card-crown" aria-hidden="true">
          <Crown strokeWidth={2} />
        </span>
      )}
      {wrong && (
        <span className="shatter-layer" aria-hidden="true">
          <i className="fracture fracture-a" />
          <i className="fracture fracture-b" />
          <i className="fracture fracture-c" />
          <i className="shard shard-a" />
          <i className="shard shard-b" />
          <i className="shard shard-c" />
          <i className="shard shard-d" />
        </span>
      )}
      {wrong && (
        <span className="wrong-badge" aria-hidden="true">
          ×
        </span>
      )}
    </button>
  );
}