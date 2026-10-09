/** Calibration from the bundled clip's final frame (540 × 960, frame 240).
 * The emblem is registered independently of the video title underneath it.
 * Artwork bounds exclude the transparent glow around the 720px app emblem.
 */
export const INTRO_SESSION_KEY = "ktk:intro:played";
export const INTRO_FADE_MS = 820;
export const INTRO_ZOOM_MS = 900;
export const INTRO_FRAME = { width: 540, height: 960 };
export const VIDEO_EMBLEM = { left: 80, top: 210, width: 380, height: 436 };
export const APP_EMBLEM = { left: 51, top: 14, width: 619, height: 683, canvas: 720 };

export interface LogoBox { left: number; top: number; width: number; height: number }
type IntroStorage = Pick<Storage, "getItem" | "setItem">;
let playedInDocument = false;

/** Reserve before playback, so refreshes and remounts cannot replay the clip.
 * sessionStorage resets with the tab/app session; memory covers denied storage.
 */
export function claimSessionIntro(storage?: IntroStorage): boolean {
  try {
    if (storage) {
      if (storage.getItem(INTRO_SESSION_KEY)) {
        playedInDocument = true;
        return false;
      }
      storage.setItem(INTRO_SESSION_KEY, "1");
      playedInDocument = true;
      return true;
    }
  } catch { /* Private/embedded browsers may deny storage. */ }
  if (playedInDocument) return false;
  playedInDocument = true;
  return true;
}

/** Match the video element's centred object-fit, including cover cropping. */
export function registeredLogoBox(video: LogoBox, fit: "cover" | "contain"): LogoBox {
  const scales = [video.width / INTRO_FRAME.width, video.height / INTRO_FRAME.height];
  const scale = fit === "cover" ? Math.max(...scales) : Math.min(...scales);
  const frameLeft = video.left + (video.width - INTRO_FRAME.width * scale) / 2;
  const frameTop = video.top + (video.height - INTRO_FRAME.height * scale) / 2;
  const sx = VIDEO_EMBLEM.width * scale / APP_EMBLEM.width;
  const sy = VIDEO_EMBLEM.height * scale / APP_EMBLEM.height;
  return {
    left: frameLeft + VIDEO_EMBLEM.left * scale - APP_EMBLEM.left * sx,
    top: frameTop + VIDEO_EMBLEM.top * scale - APP_EMBLEM.top * sy,
    width: APP_EMBLEM.canvas * sx,
    height: APP_EMBLEM.canvas * sy,
  };
}

/** The final transform lands exactly on the actual home image's layout box. */
export function logoBoxTransform(from: LogoBox, to: LogoBox): string {
  return `matrix(${to.width / from.width}, 0, 0, ${to.height / from.height}, ${to.left - from.left}, ${to.top - from.top})`;
}
