"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { dealTimings, SHUFFLE_MS } from "@/features/game/constants/pacing";
import { ARC_DROP, CARD_PITCH, cardFanContact, cardFanSlot, indexToSlot } from "@/features/game/logic/cardFan";
import { DEALER_ART, dealerSwipePlan } from "@/features/game/logic/dealerSwipe";
import { CardRow } from "./CardRow";
import { oppositePoint } from "../logic/tablePerspective";

/** Shared local/online deal: screen-wide hand swipe above the actual fan.
 * Portalling to the board lets the long arm reach past its entry edge, rather
 * than being visibly cut at the scrollable table's boundary.
 *
 * `fromBottom` picks the edge the hand serves from — the bottom of THIS screen
 * (the default, and the online board's original choreography) or the top. The
 * deck lands from the same edge, whichever it is, so the cards are never served
 * from one end while they settle on the other.
 */
export function DealerSwipe({ cards, mirrored = false, opposite = false, fromBottom = true, windowMs = SHUFFLE_MS, reducedMotion = false, oppFromTop = false }: {
  cards: number; mirrored?: boolean; opposite?: boolean; fromBottom?: boolean; windowMs?: number; reducedMotion?: boolean;
  /** The Rival will guess next: keep the same top gap as the guess row so the deck never jumps. */
  oppFromTop?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLImageElement>(null);
  const [board, setBoard] = useState<HTMLElement | null>(null);
  const timing = dealTimings(cards, windowMs);
  // The cards arrive from the hand's edge. In the row's OWN frame that edge is
  // the LOW one whenever the hand and the row disagree about which way is down:
  // an upright row served from the bottom, or a flipped row served from the top.
  // A mirrored board that passes `opposite` alone keeps the shipped
  // serve-from-the-bottom beat, because there both flags agree.
  const deckFromOwner = fromBottom !== opposite;

  useLayoutEffect(() => {
    // The portal host is a measured DOM ancestor, resolved before first paint.
    setBoard(rowRef.current?.closest<HTMLElement>(".game-screen") ?? null);
  }, []);

  useLayoutEffect(() => {
    const row = rowRef.current, hand = handRef.current;
    if (!board || !row || !hand || reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let animation: Animation | undefined;
    const started = performance.now();
    const arrange = () => {
      const bounds = board.getBoundingClientRect();
      const contacts = Array.from(row.querySelectorAll<HTMLElement>(".dealer-contact"))
        .sort((a, b) => Number(a.dataset.slot) - Number(b.dataset.slot))
        .map(marker => { const p = marker.getBoundingClientRect(); const x = p.left - bounds.left, y = p.top - bounds.top;
          return fromBottom ? oppositePoint({ x, y }, bounds.width, bounds.height) : { x, y }; });
      const card = row.querySelector<HTMLElement>(".playing-card");
      if (!contacts.length || !card) return;
      // A bottom-served overlay is a 180-degree copy of the top choreography.
      // Contacts are converted back first, so both the landing depth and the
      // hidden forearm buffer are identical relative to the entry edge.
      const plan = dealerSwipePlan(contacts, card.offsetWidth);
      hand.style.width = `${plan.width}px`;
      hand.style.height = `${plan.height}px`;
      animation?.cancel();
      animation = hand.animate(plan.frames, { duration: windowMs, fill: "both", easing: "linear" });
      // A resize retargets the same beat; it cannot replay the hand entrance.
      animation.currentTime = Math.min(windowMs, performance.now() - started);
    };
    arrange();
    row.addEventListener("card-row-aligned", arrange);
    const observer = new ResizeObserver(arrange);
    observer.observe(row); observer.observe(board);
    return () => { observer.disconnect(); row.removeEventListener("card-row-aligned", arrange); animation?.cancel(); };
  }, [board, cards, mirrored, opposite, fromBottom, reducedMotion, windowMs]);

  return <>
    <CardRow ref={rowRef} opposite={opposite} className={`dealing dealer-swipe${mirrored ? " mirrored" : ""}${deckFromOwner ? " dealt-from-owner" : ""}${oppFromTop ? " opp-room" : ""}`}
      style={{ "--deal-flight": `${timing.flight}s` } as React.CSSProperties}>
      {Array.from({ length: cards }, (_, index) => {
        const slot = indexToSlot(index, cards, mirrored);
        return <PlayingCard key={index} index={index} fanCount={cards} fanSlot={slot} disabled dealDelay={timing.launch(slot)} />;
      })}
      {Array.from({ length: cards }, (_, slot) => {
        const { x, y } = cardFanSlot(slot, cards), contact = cardFanContact(slot, cards, .25);
        return <span key={slot} className="dealer-contact" data-slot={slot} aria-hidden="true" style={{
          left: `calc(50% + ${x / CARD_PITCH} * var(--card-pitch) + ${contact.x} * var(--fan-card-h))`,
          top: `calc(${y / ARC_DROP} * var(--fan-drop) + ${contact.y} * var(--fan-card-h))`,
        }} />;
      })}
    </CardRow>
    {board && createPortal(<div className={`dealer-swipe-overlay${fromBottom ? " from-bottom" : ""}`} aria-hidden="true">
      <Image ref={handRef} className="dealer-swipe-hand" src="/dealer-swipe-hand.png" alt=""
        width={DEALER_ART.width} height={DEALER_ART.height} priority unoptimized />
    </div>, board)}
  </>;
}
