/**
 * The utility bar at the base of the board.
 *
 * Two actions: open the Strategy panel (always available) and accuse the dealer
 * of bluffing (only meaningful while the human is guessing). The disabled state
 * is the whole reason this is a component — it must be impossible to accuse at
 * the wrong moment.
 */
export function PowerDock({
  bluffActive,
  onStrategy,
  onBluff,
  onStickers,
}: {
  /** True only while the human is the guesser and may call a bluff. */
  bluffActive: boolean;
  onStrategy: () => void;
  onBluff: () => void;
  /** Opens the sticker tray. Omitted where stickers are off (Pass & Play). */
  onStickers?: () => void;
}) {
  return (
    <nav className="power-dock" aria-label="Powers">
      {onStickers && <button onClick={onStickers} aria-label="Send a sticker">
        <span>☺</span>
        <b>STICKERS</b>
      </button>}
      <button onClick={onStrategy}>
        <span>▱</span>
        <b>STRATEGY</b>
      </button>
      {bluffActive && <button onClick={onBluff}>
        <span>◑</span>
        <b>CALL BLUFF</b>
      </button>}
    </nav>
  );
}
