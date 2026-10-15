"use client";

import { STICKERS, stickerById, stickerSrc } from "@/features/game/constants/stickers";

/**
 * Sticker tray (bottom sheet) and the sticker "bubble" that pops up on the
 * board when someone sends one.
 *
 * Both are presentation only: the screen that mounts them decides who sent
 * what and when (local bot, or the online room).
 */

/** Bottom sheet with every sticker. Tapping one sends it and closes the tray. */
export function StickerTray({
  onPick,
  onClose,
  coolingDown,
}: {
  onPick: (id: string) => void;
  onClose: () => void;
  /** True right after sending: the tray shows why nothing can be sent yet. */
  coolingDown: boolean;
}) {
  return (
    <div className="sticker-tray-backdrop">
      {/* Tapping the dimmed area above the sheet closes it. */}
      <button className="sticker-tray-dismiss" aria-label="Close stickers" tabIndex={-1} onClick={onClose} />
      <section className="sticker-tray" role="dialog" aria-label="Send a sticker">
        <header className="sticker-tray-head">
          <b>SEND A STICKER</b>
          <button className="sticker-tray-close" onClick={onClose} aria-label="Close stickers">
            ×
          </button>
        </header>
        {coolingDown ? <p className="sticker-tray-wait">Wait a moment before sending another…</p> : null}
        <div className="sticker-grid">
          {STICKERS.map((sticker) => (
            <button
              key={sticker.id}
              className="sticker-option"
              disabled={coolingDown}
              onClick={() => onPick(sticker.id)}
              aria-label={`Send sticker: ${sticker.label}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- small static sticker art */}
              <img src={stickerSrc(sticker.id)} alt="" loading="lazy" />
              <small>{sticker.label}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * A sticker that just arrived. `from="them"` is the opponent's, `from="me"`
 * is yours. The `key` the parent gives it restarts the pop animation for every
 * new sticker.
 */
export function StickerBubble({ id, from, name }: { id: string; from: "me" | "them"; name: string }) {
  const sticker = stickerById(id);
  if (!sticker) return null;
  return (
    <div className={`sticker-bubble sticker-from-${from}`} role="status" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element -- small static sticker art */}
      <img src={stickerSrc(sticker.id)} alt={sticker.label} />
      <span>
        <b>{name}</b> {sticker.label}
      </span>
    </div>
  );
}