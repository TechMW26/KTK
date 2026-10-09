"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  claimSessionIntro, INTRO_FADE_MS, INTRO_ZOOM_MS,
  logoBoxTransform, registeredLogoBox, type LogoBox,
} from "@/features/game/logic/introTransition";

type IntroPhase = "checking" | "playing" | "fading" | "zooming";

/** One session intro: final frame → complete video fade → logo settles home.
 * The handoff uses the actual app emblem asset and measures its final DOM box.
 */
export function SplashScreen({ onDone, logoRef, sound }: {
  onDone: () => void;
  logoRef: RefObject<HTMLImageElement | null>;
  sound: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const spriteRef = useRef<HTMLImageElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  const checkedRef = useRef(false);
  const phaseRef = useRef<IntroPhase>("checking");
  const [phase, setPhase] = useState<IntroPhase>("checking");
  const active = phase !== "checking";

  useLayoutEffect(() => { doneRef.current = onDone; }, [onDone]);
  useLayoutEffect(() => {
    // Strict Mode replays effects; this instance must reserve the session once.
    if (checkedRef.current) return;
    checkedRef.current = true;
    let storage: Storage | undefined;
    try { storage = window.sessionStorage; } catch { /* Memory fallback. */ }
    if (!claimSessionIntro(storage)) {
      doneRef.current();
      return;
    }
    phaseRef.current = "playing";
    // Resolve session state before painting the intro, avoiding a replay flash.
    setPhase("playing");
  }, []);

  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    const sprite = spriteRef.current;
    const backdrop = backdropRef.current;
    const homeLogo = logoRef.current;
    if (!video || !sprite || !backdrop || !homeLogo) {
      doneRef.current();
      return;
    }
    let disposed = false;
    let completed = false;
    let fadeStarted = false;
    let zoomStartedAt = 0;
    let videoFade: Animation | undefined;
    let backgroundFade: Animation | undefined;
    let logoZoom: Animation | undefined;
    let skipFallback: number | undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeMs = reduced ? 1 : INTRO_FADE_MS;
    const zoomMs = reduced ? 1 : INTRO_ZOOM_MS;

    const finish = () => {
      if (disposed || completed) return;
      completed = true;
      doneRef.current();
    };
    const setBox = (box: LogoBox) => {
      Object.assign(sprite.style, {
        left: `${box.left}px`, top: `${box.top}px`,
        width: `${box.width}px`, height: `${box.height}px`, transform: "none",
      });
    };
    const register = () => {
      const fit = getComputedStyle(video).objectFit === "contain" ? "contain" : "cover";
      setBox(registeredLogoBox(video.getBoundingClientRect(), fit));
      sprite.style.filter = getComputedStyle(homeLogo).filter;
    };
    const zoomToHome = (from: LogoBox, duration: number) => {
      logoZoom?.cancel();
      setBox(from);
      const animation = sprite.animate([
        { transform: "none" },
        { transform: logoBoxTransform(from, homeLogo.getBoundingClientRect()) },
      ], { duration, easing: "cubic-bezier(.22,.8,.25,1)", fill: "forwards" });
      logoZoom = animation;
      animation.onfinish = () => { if (logoZoom === animation) finish(); };
    };
    const resize = () => {
      if (disposed || completed) return;
      if (phaseRef.current === "zooming") {
        // Retarget from the currently displayed position without restarting time.
        const current = sprite.getBoundingClientRect();
        zoomToHome(current, Math.max(1, zoomMs - (performance.now() - zoomStartedAt)));
      } else {
        register();
      }
    };
    const fadeOut = async () => {
      if (fadeStarted || disposed || completed) return;
      fadeStarted = true;
      clearTimeout(watchdog);
      video.pause(); // Hold the final/current frame throughout its fade.
      try { await sprite.decode(); } catch { finish(); return; }
      if (disposed) return;
      register();
      phaseRef.current = "fading";
      setPhase("fading");
      videoFade = video.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: fadeMs, easing: "ease-in-out", fill: "forwards",
      });
      try { await videoFade.finished; } catch { return; }
      if (disposed || completed) return;
      // The video is fully gone BEFORE either the logo or backdrop can move.
      video.style.opacity = "0";
      video.hidden = true;
      videoFade.cancel();
      phaseRef.current = "zooming";
      setPhase("zooming");
      zoomStartedAt = performance.now();
      backgroundFade = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: reduced ? 1 : 450, easing: "ease-out", fill: "forwards",
      });
      zoomToHome(sprite.getBoundingClientRect(), zoomMs);
    };
    const end = () => { void fadeOut(); };
    const watchdog = window.setTimeout(end, 20_000);
    const skipToEnd = () => {
      if (fadeStarted) return;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.pause();
        video.addEventListener("seeked", end, { once: true });
        try { video.currentTime = Math.max(0, video.duration - .05); } catch { end(); }
        skipFallback = window.setTimeout(end, 500);
      } else { end(); }
    };
    video.addEventListener("ended", end);
    video.addEventListener("error", end);
    const skip = document.getElementById("intro-skip");
    skip?.addEventListener("click", skipToEnd);
    const observer = new ResizeObserver(resize);
    observer.observe(video);
    observer.observe(homeLogo);
    window.addEventListener("resize", resize);
    void document.fonts.ready.then(resize);
    register();

    // Keep sound where permitted, automatically retry muted when it is blocked.
    video.muted = !sound;
    void video.play().catch(async () => {
      if (disposed || fadeStarted) return;
      video.muted = true;
      try { await video.play(); } catch { end(); }
    });

    return () => {
      disposed = true;
      clearTimeout(watchdog);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      video.removeEventListener("ended", end);
      video.removeEventListener("error", end);
      skip?.removeEventListener("click", skipToEnd);
      video.removeEventListener("seeked", end);
      clearTimeout(skipFallback);
      video.pause();
      videoFade?.cancel();
      backgroundFade?.cancel();
      logoZoom?.cancel();
    };
  }, [active, logoRef, sound]);

  if (!active) return null;
  return (
    <div className="splash-screen" data-phase={phase} role="dialog" aria-modal="true" aria-label="Kill the King intro">
      <div ref={backdropRef} className="splash-backdrop" />
      <Image ref={spriteRef} className="splash-logo" src="/cards/ktk-emblem-gold.webp" alt="" width={720} height={720} unoptimized priority aria-hidden="true" />
      {/* Decorative animation without spoken content. */}
      <video ref={videoRef} className="splash-video" src="/video/intro.mp4" aria-label="Kill the King intro animation" autoPlay muted playsInline preload="auto" />
      {phase === "playing" && <button id="intro-skip" className="splash-skip" type="button">SKIP</button>}
    </div>
  );
}
