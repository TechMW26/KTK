"use client";

import type { ReactNode } from "react";

/**
 * Shared presentational micro-helpers for the multiplayer screens. They reuse the
 * single-player game's global CSS classes in app/globals.css (shell, ornaments,
 * eyebrows, buttons, modals, cards) so online rooms look native to the game.
 */

export function MpLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "logo compact" : "logo"} aria-label="Kill the King">
      <span className="logo-crown">♛</span>
      <strong>KILL</strong>
      <i>THE</i>
      <strong>KING</strong>
    </div>
  );
}

export function MpOrnament() {
  return (
    <div className="ornament" aria-hidden="true">
      <span>◆</span>
    </div>
  );
}

export function MpEyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

/** Full-screen frame around any in-match screen, honouring safe-ish insets. */
export function MpFrame({ children }: { children: ReactNode }) {
  return <section className="mp-frame">{children}</section>;
}

/** A self-contained modal that visually matches the game's existing dialogs. */
export function MpModal({
  title,
  eyebrow,
  symbol = "♛",
  onClose,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  symbol?: string;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className={`modal-card ${className}`} role="dialog" aria-modal="true">
        {onClose && (
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
        <span className="modal-symbol">{symbol}</span>
        {eyebrow && <MpEyebrow>{eyebrow}</MpEyebrow>}
        <h3>{title}</h3>
        <MpOrnament />
        {children}
      </section>
    </div>
  );
}

/** Face-down / face-up card built from the game's .playing-card CSS. */
export function MpCard({
  index,
  faceUp,
  king,
  blank,
  chosen,
  wrong,
  disabled,
  onClick,
}: {
  index: number;
  faceUp?: boolean;
  king?: boolean;
  blank?: boolean;
  chosen?: boolean;
  wrong?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={[
        "playing-card",
        faceUp ? "face-up" : "",
        king ? "is-king" : "",
        chosen ? "chosen" : "",
        wrong ? "shattered" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={disabled}
      aria-label={faceUp ? `Card ${index + 1}` : `Choose card ${index + 1}`}
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
      {wrong && <span className="wrong-badge" aria-hidden="true">×</span>}
    </button>
  );
}
