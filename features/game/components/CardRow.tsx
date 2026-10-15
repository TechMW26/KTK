"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { oppositeRowOffset } from "../logic/tablePerspective";

/**
 * Turn the table around the board centre, preserving equal edge distances.
 *
 * `opposite` is the far seat's view of the same cards: the fan always bows
 * toward the deck's owner, so the table rows pass it exactly while the dealer
 * is not the local player. The row is rotated, so its cards would otherwise hang
 * at the far edge of its box — the arc is therefore re-anchored to the SAME place
 * an upright row's cards occupy, leaving the deck's position identical in every
 * phase and every round. See `align` below.
 */
export function CardRow({ children, opposite = false, className = "", style, ref }: {
  children: ReactNode; opposite?: boolean; className?: string; style?: CSSProperties;
  ref?: RefObject<HTMLDivElement | null>;
}) {
  const ownRef = useRef<HTMLDivElement>(null);
  const rowRef = ref ?? ownRef;
  useLayoutEffect(() => {
    const row = rowRef.current, board = row?.closest<HTMLElement>(".game-screen");
    if (!row || !board || !opposite) return;
    let offset = 0;
    let active = true;
    const align = () => {
      const b = board.getBoundingClientRect(), r = row.getBoundingClientRect();
      const naturalTop = r.top - b.top - offset;
      const reflected = oppositeRowOffset(b.height, naturalTop, r.height);
      const title = row.parentElement?.querySelector<HTMLElement>(".stage-title");
      const cards = [...row.querySelectorAll<HTMLElement>(".playing-card, .selection-hand-img, .inspection-hand")];
      const fanTop = Math.min(...cards.map(card => card.getBoundingClientRect().top)) - b.top - offset;
      /* Park the topmost card just under the heading. That is exactly where an
         UPRIGHT row's cards land — the row starts where the heading ends — so the
         deck holds one place whether it is drawn for the near seat or the far one,
         while the King is hidden, served, searched and turned over.
         `reflected` is kept only as the fallback for a row with no heading to
         align to: it is the mirrored table position, which sits tens of pixels
         away and shifts with the court's card size (a flipped deck would visibly
         step away from the spot those same cards held a moment earlier). */
      const clearance = title && cards.length ? title.getBoundingClientRect().bottom - b.top + 12 - fanTop : reflected;
      const nextOffset = title && cards.length ? clearance : reflected;
      const changed = Math.abs(nextOffset - offset) > .001;
      offset = nextOffset;
      row.style.setProperty("--opposite-offset", `${offset}px`);
      if (changed) row.dispatchEvent(new Event("card-row-aligned"));
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(board); observer.observe(row);
    // Fonts/header content can change placement without changing row size.
    if (row.parentElement) observer.observe(row.parentElement);
    const mutations = new MutationObserver(records => { if (records.some(record => record.type === "childList" || record.target !== row)) align(); });
    mutations.observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    void document.fonts.ready.then(() => { if (active) align(); });
    window.addEventListener("resize", align);
    return () => {
      observer.disconnect(); mutations.disconnect(); window.removeEventListener("resize", align);
      active = false;
      row.style.removeProperty("--opposite-offset");
    };
  }, [opposite, rowRef]);
  return <div ref={rowRef} className={`cards-row fanned${opposite ? " opposite-view" : ""} ${className}`} style={style}>{children}</div>;
}
