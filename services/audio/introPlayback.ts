/** Keep the intro automatic while recovering sound after autoplay restrictions. */
export function startIntroPlayback(
  video: Pick<HTMLVideoElement, "muted" | "defaultMuted" | "volume" | "paused" | "play">,
  gestures: Pick<Document, "addEventListener" | "removeEventListener">,
  sound: boolean,
  onUnavailable: () => void,
) {
  let disposed = false;
  let attempt = 0;
  video.volume = 1;
  video.defaultMuted = !sound;

  const play = (audible: boolean) => {
    if (disposed) return;
    const currentAttempt = ++attempt;
    video.muted = !audible;
    // Invoke synchronously in the gesture handler: Safari consumes activation
    // before a deferred callback can unmute and resume the same video.
    void video.play().catch((error: unknown) => {
      if (disposed || currentAttempt !== attempt) return;
      if (error instanceof Error && error.name === "AbortError") return;
      if (audible && error instanceof Error && error.name === "NotAllowedError") {
        play(false);
      } else {
        onUnavailable();
      }
    });
  };
  const unlock = (event: Event) => {
    if (!sound || disposed) return;
    // Skip should finish the intro rather than resume its soundtrack.
    if (typeof Element !== "undefined" && event.target instanceof Element && event.target.closest("#intro-skip")) return;
    if (video.muted || video.paused) play(true);
  };
  gestures.addEventListener("click", unlock, true);
  gestures.addEventListener("touchend", unlock, true);
  gestures.addEventListener("keydown", unlock, true);
  play(sound);

  return () => {
    disposed = true;
    attempt++;
    gestures.removeEventListener("click", unlock, true);
    gestures.removeEventListener("touchend", unlock, true);
    gestures.removeEventListener("keydown", unlock, true);
  };
}
