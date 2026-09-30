import { Logo } from "@/components/common/Brand";
import { STARTING_LIVES } from "@/features/game/constants/courts";
import type { Seat } from "@/features/game/types/game";

/**
 * The match header: brand, round medallion, turn clock and score rail.
 *
 * Everything it shows is derived from props — it owns no state and runs no
 * timers. `time === null` means "nobody is on the clock right now", which is how
 * the header knows to swap the dial for the settings button.
 */

/**
 * A row of heart pips, `filled` of them full.
 *
 * Shared by the local 5-Lives bar and the online lives strip so both render the
 * same number of pips for the same life count.
 */
export function LifePips({ filled }: { filled: number }) {
  const count = Math.max(0, Math.min(STARTING_LIVES, Math.round(filled)));
  return (
    <>
      {Array.from({ length: STARTING_LIVES }, (_, pip) => (
        <span key={pip} className={`life ${pip < count ? "" : "lost"}`} aria-hidden="true">
          ❤
        </span>
      ))}
    </>
  );
}

export function GameHeader({
  level,
  round,
  cardCount,
  points,
  seconds,
  names,
  scores,
  time,
  activePlayer,
  activeAction,
  onSettings,
  hearts,
}: {
  level: number;
  round: number;
  cardCount: number;
  points: number;
  seconds: number;
  names: [string, string];
  scores: [number, number];
  /** Seconds left, or null when no one is on the clock. */
  time: number | null;
  /** Seat currently acting, or null in neutral phases. */
  activePlayer: Seat | null;
  /** One-word verb shown beside the acting player ("HIDING", "GUESSING"). */
  activeAction: string | null;
  onSettings: () => void;
  /** When provided, the rail shows lives instead of score for both seats. */
  hearts?: [number, number] | null;
}) {
  const showHearts = Boolean(hearts);
  const valueFor = (seat: Seat) => (showHearts ? hearts![seat] : scores[seat]);
  const progress = time === null ? 0 : Math.max(0, time / seconds) * 360;

  return (
    <header className="game-header">
      <Logo compact />

      <div className="round-medallion">
        <small>LEVEL {level + 1}</small>
        <strong>{String(round).padStart(2, "0")}</strong>
      </div>

      <div className="header-controls">
        {time === null ? (
          <button className="mini-settings" onClick={onSettings} aria-label="Settings">
            ⚙
          </button>
        ) : (
          <div className="timer" style={{ "--timer": `${progress}deg` } as React.CSSProperties}>
            <strong>{time}</strong>
            <small>SEC</small>
          </div>
        )}
      </div>

      <div className="score-strip">
        <span className={activePlayer === 0 ? "active-turn" : ""}>
          {activePlayer === 0 && activeAction && <small>{activeAction}</small>}
          <strong>{names[0]}</strong>
          <b>{valueFor(0)}</b>
        </span>
        <i>
          {cardCount} CARDS · {points}×
        </i>
        <span className={activePlayer === 1 ? "active-turn" : ""}>
          <b>{valueFor(1)}</b>
          <strong>{names[1]}</strong>
          {activePlayer === 1 && activeAction && <small>{activeAction}</small>}
        </span>
      </div>

      {showHearts && (
        <div className="single-lives-bar">
          <span className="lives-row">
            <LifePips filled={hearts![0]} />
          </span>
          <em>LIVES</em>
          <span className="lives-row">
            <LifePips filled={hearts![1]} />
          </span>
        </div>
      )}
    </header>
  );
}
