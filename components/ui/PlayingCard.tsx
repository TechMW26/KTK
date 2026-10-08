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
}: PlayingCardProps) {
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
    ? king
      ? `King in card ${index + 1}`
      : `Card ${index + 1}`
    : `Choose card ${index + 1}`;

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
    >
      <span className="card-inner">
        <span className="card-back">
          <small>KTK</small>
          <b>♛</b>
          <em>◆</em>
        </span>
        <span className="card-front">
          {blank ? (
            <span className="blank-card">
              <b>?</b>
              <small>EMPTY</small>
            </span>
          ) : king ? (
            <>
              <span className="corner-rank">
                K<small>♥</small>
              </span>
              <span className="king-face">♚</span>
              <span className="king-label">THE KING</span>
            </>
          ) : (
            <>
              <span className="corner-rank">
                {index + 1}
                <small>♥</small>
              </span>
              <span className="heart-pip">♥</span>
            </>
          )}
        </span>
      </span>
      {king && faceUp && (
        <span className="card-crown" aria-hidden="true">
          ♛
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
