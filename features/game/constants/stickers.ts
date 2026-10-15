/**
 * In-game stickers.
 *
 * The art is the "Royal Kingdom" King emote set (assets/stickers), copied to
 * /public/stickers/<id>.png. Each sticker has a `mood`, which is how
 * the bot picks a fitting one (tease after your wrong pick, sulk after a loss).
 *
 * The order here is the order of the tray, most-used moods first.
 */

export type StickerMood = "tease" | "win" | "lose" | "friendly" | "think" | "angry";

export interface Sticker {
  id: string;
  /** Short caption under the sticker in the tray and the bubble. */
  label: string;
  mood: StickerMood;
}

export const STICKERS: readonly Sticker[] = [
  { id: "laugh-point", label: "Ha ha!", mood: "tease" },
  { id: "gotcha", label: "Gotcha!", mood: "tease" },
  { id: "skull", label: "King's dead", mood: "tease" },
  { id: "whisper", label: "Bluffing?", mood: "tease" },
  { id: "shadow", label: "I see you", mood: "tease" },
  { id: "too-easy", label: "Too easy", mood: "win" },
  { id: "cool-king", label: "Cool King", mood: "win" },
  { id: "jackpot", label: "Jackpot!", mood: "win" },
  { id: "victory", label: "Victory!", mood: "win" },
  { id: "thumbs-up", label: "Nice one", mood: "friendly" },
  { id: "fist-bump", label: "Good game", mood: "friendly" },
  { id: "cheers", label: "Cheers!", mood: "friendly" },
  { id: "hug", label: "Love it", mood: "friendly" },
  { id: "thinking", label: "Hmm…", mood: "think" },
  { id: "arm-wrestle", label: "Bring it", mood: "think" },
  { id: "fuming", label: "Grrr!", mood: "angry" },
  { id: "face-off", label: "Face me!", mood: "angry" },
  { id: "crying", label: "Noooo", mood: "lose" },
  { id: "knocked-out", label: "I'm done", mood: "lose" },
  { id: "done-for", label: "Defeated", mood: "lose" },
];

/** Public URL of a sticker image. */
export function stickerSrc(id: string): string {
  return `/stickers/${id}.png`;
}

export function stickerById(id: string | null | undefined): Sticker | null {
  if (!id) return null;
  return STICKERS.find((sticker) => sticker.id === id) ?? null;
}

/** How long a sent sticker stays on screen. */
export const STICKER_SHOW_MS = 2800;

/** Minimum gap between two stickers from the same player (stops spam). */
export const STICKER_COOLDOWN_MS = 3000;