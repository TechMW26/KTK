"use client";

import type { ReactNode } from "react";

import { Eyebrow, Logo, Ornament } from "@/components/common/Brand";

/**
 * Multiplayer chrome.
 *
 * The online screens are built from the same primitives as the single-player
 * board, so a room looks native to the game rather than like a second product.
 * These thin re-exports keep the multiplayer call sites readable while the
 * implementations live in one shared place.
 */

export { Logo as MpLogo, Ornament as MpOrnament, Eyebrow as MpEyebrow };

/** Full-screen frame around any in-match screen, honouring safe-area insets. */
export function MpFrame({ children }: { children: ReactNode }) {
  return <section className="mp-frame">{children}</section>;
}

/**
 * A dialog that matches the game's other modals.
 *
 * Unlike the shared `Modal` this one always renders the crown symbol and the
 * title/ornament header, because every online dialog wants that shape.
 */
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
      <section className={["modal-card", className].filter(Boolean).join(" ")} role="dialog" aria-modal="true">
        {onClose && (
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
        <span className="modal-symbol">{symbol}</span>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h3>{title}</h3>
        <Ornament />
        {children}
      </section>
    </div>
  );
}
