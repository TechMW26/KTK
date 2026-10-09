import { Ornament } from "@/components/common/Brand";
import type { TurnAnnouncement } from "@/features/game/types/game";
import { Circle, Crown } from "lucide-react";

/**
 * The two ways the game announces whose turn it is.
 *
 * Both are driven by the same `TurnAnnouncement`, so the copy and the seat
 * phrasing can never disagree:
 *   - `TurnIndicator`  — the persistent rail near the top of the board.
 *   - `TurnTransition` — the cinematic veil that covers the board for a beat
 *                        when the turn passes to the other player.
 */

/** Persistent "YOUR TURN / OPPONENT'S TURN" rail. */
export function TurnIndicator({ turn }: { turn: TurnAnnouncement | null }) {
  if (!turn) return null;
  const isPlayer = turn.kind === "player";
  return (
    <div className={["turn-indicator", isPlayer ? "player-turn" : "opponent-turn"].join(" ")}>
      <span className="turn-dot">
        <Circle fill="currentColor" strokeWidth={0} />
      </span>
      <span className="turn-text">
        <b>{turn.title}</b>
        <small>{turn.subtitle}</small>
      </span>
    </div>
  );
}

/**
 * The brief full-screen hand-off veil.
 *
 * Marked `aria-hidden` on purpose: it is decorative repetition of what the rail
 * already announces, and it disappears on its own.
 */
export function TurnTransition({ turn }: { turn: TurnAnnouncement | null }) {
  if (!turn) return null;
  const isPlayer = turn.kind === "player";
  return (
    <div
      className={["turn-transition", isPlayer ? "player-turn" : "opponent-turn"].join(" ")}
      aria-hidden="true"
    >
      <div className="turn-transition-announce">
        <span className="turn-transition-crown">
          <Crown strokeWidth={2} />
        </span>
        <b className="turn-transition-title">{turn.title}</b>
        <Ornament />
        <small className="turn-transition-subtitle">{turn.subtitle}</small>
      </div>
    </div>
  );
}
