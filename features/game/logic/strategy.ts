import type { RoundHistoryEntry } from "../types/game.ts";

/**
 * The Strategy panel's analytics.
 *
 * It answers one question: "which card does this player keep reaching for?"
 * Only rounds where the player actually picked a card are counted — a bluff
 * accusation or a timeout records no pick and must not skew the pattern.
 *
 * This is presentation-only analysis. It never feeds back into gameplay.
 */

export interface PickFrequency {
  /** How many times each card was picked, index 0 = card 1. */
  counts: number[];
  /** The highest count, or 0 when nothing was recorded. */
  highest: number;
  /** 1-based card picked most often, or null when there is no data yet. */
  favourite: number | null;
  /** Total picks actually recorded. */
  total: number;
}

/** Rounds this player guessed and actually picked a card during this court. */
export function picksThisCourt(
  history: RoundHistoryEntry[],
  level: number,
  seat: number,
): RoundHistoryEntry[] {
  return history.filter(
    (entry) => entry.level === level && entry.guesser === seat && entry.pick !== null,
  );
}

/** Count which card was picked how often across the given rounds. */
export function summarisePicks(entries: RoundHistoryEntry[], cards: number): PickFrequency {
  const counts = Array.from({ length: cards }, () => 0);

  for (const entry of entries) {
    if (entry.pick === null) continue;
    const index = entry.pick - 1;
    if (index >= 0 && index < counts.length) counts[index] += 1;
  }

  const highest = counts.reduce((max, count) => Math.max(max, count), 0);
  const favourite = highest > 0 ? counts.indexOf(highest) + 1 : null;

  return { counts, highest, favourite, total: entries.filter((entry) => entry.pick !== null).length };
}

/**
 * A plain-language read on the pattern, used as the panel's caption.
 *
 * Kept here rather than in the component so the wording rule ("is it centre,
 * left or right?") is one testable decision.
 */
export function describePattern(favourite: number | null, cards: number): string {
  if (favourite === null) return "";
  if (favourite === Math.ceil(cards / 2)) return "CENTER-FOCUSED";
  return favourite <= cards / 2 ? "LEFT-LEANING" : "RIGHT-LEANING";
}
