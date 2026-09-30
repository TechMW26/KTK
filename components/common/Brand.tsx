/**
 * The game wordmark.
 *
 * Presentational only — the crown, the stacked words and the divider rule are
 * pure CSS. `compact` is the version that sits in the match header.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "logo compact" : "logo"} aria-label="Kill the King">
      <span className="logo-crown">♛</span>
      <strong>KILL</strong>
      <i>THE</i>
      <strong>KING</strong>
    </div>
  );
}

/** The ◆ rule that separates a heading from the copy beneath it. */
export function Ornament() {
  return (
    <div className="ornament" aria-hidden="true">
      <span>◆</span>
    </div>
  );
}

/** The small-caps label that sits above a heading. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}
