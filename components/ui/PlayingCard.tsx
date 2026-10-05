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
 */

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
}: PlayingCardProps) {
  const className = [
    "playing-card",
    faceUp ? "face-up" : "",
    king ? "is-king" : "",
    chosen ? "chosen" : "",
    wrong ? "shattered" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = faceUp
    ? king
      ? `King in card ${index + 1}`
      : `Card ${index + 1}`
    : `Choose card ${index + 1}`;

  return (
    <button
      className={className}
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      style={
        dealDelay === undefined && flipDelay === undefined
          ? undefined
          : ({
              ...(dealDelay === undefined ? {} : { "--deal-delay": `${dealDelay}s` }),
              ...(flipDelay === undefined ? {} : { "--flip-delay": `${flipDelay}s` }),
            } as React.CSSProperties)
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
