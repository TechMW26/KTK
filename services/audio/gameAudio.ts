/**
 * Game audio.
 *
 * One ambient loop plus a set of one-shot cues. Everything is created lazily
 * and every `play()` is fire-and-forget: browsers reject playback before a user
 * gesture, and that rejection is expected, so it is swallowed rather than
 * surfaced. Nothing here is awaited by gameplay.
 */

export type SoundCue =
  | "start"
  | "countdown"
  | "king"
  | "wrong"
  | "bluff-open"
  | "bluff-caught"
  | "bluff-missed";

const ALL_CUES: SoundCue[] = [
  "start",
  "countdown",
  "king",
  "wrong",
  "bluff-open",
  "bluff-caught",
  "bluff-missed",
];

const AMBIENT_SRC = "/audio/background.mp3";
const AMBIENT_VOLUME = 0.4;

/** Cue volumes. The countdown sits slightly lower so it can nag without stinging. */
const CUE_VOLUME = 0.82;
const COUNTDOWN_VOLUME = 0.72;

/**
 * The countdown ticks faster as the clock runs down: 0.92x at five seconds
 * rising by 0.055 per second elapsed.
 */
const COUNTDOWN_BASE_RATE = 0.92;
const COUNTDOWN_RATE_STEP = 0.055;
const COUNTDOWN_RATE_ORIGIN = 6;

let ambient: HTMLAudioElement | null = null;

function getAmbient(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!ambient) {
    ambient = new Audio(AMBIENT_SRC);
    ambient.loop = true;
    ambient.preload = "auto";
    ambient.volume = AMBIENT_VOLUME;
  }
  return ambient;
}

/** Warm the audio cache so the first cue is not delayed. */
export function preloadGameAudio(): void {
  if (typeof window === "undefined") return;
  getAmbient()?.load();
  for (const cue of ALL_CUES) {
    const audio = new Audio(`/audio/${cue}.wav`);
    audio.preload = "auto";
    audio.load();
  }
}

/**
 * Play a one-shot cue.
 *
 * `countdown` is the seconds remaining and only affects the countdown cue's
 * pitch.
 */
export function playSoundCue(cue: SoundCue, secondsRemaining = 5): void {
  if (typeof window === "undefined") return;
  const audio = new Audio(`/audio/${cue}.wav`);
  audio.preload = "auto";
  audio.volume = cue === "countdown" ? COUNTDOWN_VOLUME : CUE_VOLUME;
  if (cue === "countdown") {
    audio.playbackRate =
      COUNTDOWN_BASE_RATE + (COUNTDOWN_RATE_ORIGIN - secondsRemaining) * COUNTDOWN_RATE_STEP;
  }
  void audio.play().catch(() => undefined);
}

/** Start (or resume) the ambient loop. */
export function startAmbientMusic(): void {
  const audio = getAmbient();
  if (!audio) return;
  void audio.play().catch(() => undefined);
}

/** Pause the ambient loop, keeping its position. */
export function stopAmbientMusic(): void {
  ambient?.pause();
}
