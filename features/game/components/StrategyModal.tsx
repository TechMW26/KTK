import { Modal as DialogShell } from "@/components/ui/Modal";
import { Eyebrow } from "@/components/common/Brand";
import { describePattern } from "@/features/game/logic/strategy";
import type { PickFrequency } from "@/features/game/logic/strategy";
import type { RoundHistoryEntry, Seat } from "@/features/game/types/game";
import { Check, Triangle } from "lucide-react";

/**
 * The Strategy board.
 *
 * Answers one question: "which card does this player keep reaching for?" It only
 * ever charts picks the player actually made while guessing, so a bluff
 * accusation or a timeout leaves no mark. Nothing here feeds back into gameplay.
 *
 * The constellation overlay draws the order in which the cards were chosen,
 * which makes a habit visible at a glance (a straight line means a player kept
 * reaching for the same seat).
 */

/** The grid is always five columns wide — one per possible card in the first court. */
const GRID = 5;

/** Positions an entry in the constellation overlay, as a percentage pair. */
function constellationPath(entries: RoundHistoryEntry[]): string {
  return entries
    .map((entry, index) =>
      entry.pick
        ? `${((entry.pick - 0.5) / GRID) * 100},${((index + 0.5) / GRID) * 100}`
        : null,
    )
    .filter(Boolean)
    .join(" ");
}

export function StrategyModal({
  names,
  tab,
  setTab,
  entries,
  frequency,
  cardCount,
  levelName,
  onClose,
}: {
  names: [string, string];
  tab: Seat;
  setTab: (tab: Seat) => void;
  entries: RoundHistoryEntry[];
  frequency: PickFrequency;
  cardCount: number;
  levelName: string;
  onClose: () => void;
}) {
  const recordedTurns = entries.slice(0, GRID);
  const constellation = constellationPath(recordedTurns);

  return (
    <DialogShell onClose={onClose} className="strategy-modal">
      <span className="modal-symbol">
        <Triangle strokeWidth={1.75} />
      </span>
      <Eyebrow>{levelName}</Eyebrow>
      <h3>STRATEGY</h3>

      <div className="strategy-tabs">
        <button className={tab === 0 ? "active" : ""} onClick={() => setTab(0)}>
          {names[0].toUpperCase()}
        </button>
        <button className={tab === 1 ? "active" : ""} onClick={() => setTab(1)}>
          {names[1].toUpperCase()}
        </button>
      </div>

      <p className="strategy-help">
        Only cards picked while guessing are recorded. Hidden King positions are never included.
      </p>

      <div className="strategy-map">
        <div className="strategy-round-labels">
          {Array.from({ length: GRID }, (_, index) => (
            <b key={index}>ROUND {index + 1}</b>
          ))}
        </div>
        <div className="strategy-card-field">
          {constellation && (
            <svg
              className="strategy-constellation"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline points={constellation} />
            </svg>
          )}
          <div className="strategy-card-grid">
            {Array.from({ length: GRID }, (_, row) =>
              Array.from({ length: GRID }, (_, column) => {
                const cardNumber = column + 1;
                const entry = recordedTurns[row];
                const selected = entry?.pick === cardNumber;
                return (
                  <div
                    key={`${row}-${column}`}
                    className={[
                      "strategy-mini-card",
                      selected ? "selected" : "",
                      cardNumber > cardCount ? "unavailable" : "",
                    ].join(" ")}
                    title={entry ? `Game round ${entry.round}` : `Turn ${row + 1}`}
                  >
                    {selected && (
                      <span>
                        {cardNumber}
                        <small><Check strokeWidth={2.5} /></small>
                      </span>
                    )}
                    {entry?.calledBluff && column === 2 && (
                      <span className="bluff-record">
                        B<small>BLUFF</small>
                      </span>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      </div>

      <div className="pattern-result">
        <small>PATTERN DETECTED</small>
        {frequency.favourite ? (
          <>
            <b>CARD {frequency.favourite} PICKED MOST</b>
            <span>
              {frequency.highest} of {frequency.total} recorded guesses ·{" "}
              {describePattern(frequency.favourite, cardCount)}
            </span>
          </>
        ) : (
          <>
            <b>NO PATTERN YET</b>
            <span>Make a guess to begin recording.</span>
          </>
        )}
      </div>

      <button className="gold-button wide" onClick={onClose}>
        CLOSE
      </button>
    </DialogShell>
  );
}
