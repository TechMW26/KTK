"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PlayingCard } from "@/components/ui/PlayingCard";
import { dealTimings, SHUFFLE_MS } from "@/features/game/constants/pacing";
import { ARC_DROP, CARD_PITCH, cardFanContact, cardFanSlot, indexToSlot } from "@/features/game/logic/cardFan";
import { DEALER_ART, dealerSwipePlan } from "@/features/game/logic/dealerSwipe";

/** Shared local/online deal: screen-wide hand swipe above the actual fan.
 * Portalling to the board lets the long arm reach past its top edge, rather
 * than being visibly cut at the scrollable table's boundary.
 */
export function DealerSwipe({ cards, mirrored = false, windowMs = SHUFFLE_MS, reducedMotion = false }: {
  cards: number; mirrored?: boolean; windowMs?: number; reducedMotion?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLImageElement>(null);
  const [board, setBoard] = useState<HTMLElement | null>(null);
  const timing = dealTimings(cards, windowMs);

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
        .map(marker => { const p = marker.getBoundingClientRect(); return { x: p.left - bounds.left, y: p.top - bounds.top }; });
      const card = row.querySelector<HTMLElement>(".playing-card");
      if (!contacts.length || !card) return;
      const plan = dealerSwipePlan(contacts, card.offsetWidth);
      hand.style.width = `${plan.width}px`;
      hand.style.height = `${plan.height}px`;
      animation?.cancel();
      animation = hand.animate(plan.frames, { duration: windowMs, fill: "both", easing: "linear" });
      // A resize retargets the same beat; it cannot replay the hand entrance.
      animation.currentTime = Math.min(windowMs, performance.now() - started);
    };
    arrange();
    const observer = new ResizeObserver(arrange);
    observer.observe(row); observer.observe(board);
    return () => { observer.disconnect(); animation?.cancel(); };
  }, [board, cards, mirrored, reducedMotion, windowMs]);

  return <>
    <div ref={rowRef} className={`cards-row fanned dealing dealer-swipe${mirrored ? " mirrored" : ""}`}
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
    </div>
    {board && createPortal(<div className="dealer-swipe-overlay" aria-hidden="true">
      <Image ref={handRef} className="dealer-swipe-hand" src="/dealer-swipe-hand.png" alt=""
        width={DEALER_ART.width} height={DEALER_ART.height} priority unoptimized />
    </div>, board)}
  </>;
}
