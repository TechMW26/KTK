import { STICKERS, type Sticker, type StickerMood } from "../constants/stickers.ts";

/**
 * When — and with which sticker — the bot "reacts".
 *
 * A person does not sticker every round, so each moment has its own chance,
 * and the bot never stickers twice within BOT_STICKER_GAP_MS. Pure: the caller
 * passes the random rolls, so the behaviour is testable.
 */

export type BotStickerMoment =
  | "match-start"
  /** The bot took the round (you picked wrong, timed out, or it found your King). */
  | "bot-won-round"
  /** You took the round. */
  | "bot-lost-round"
  | "bot-won-match"
  | "bot-lost-match"
  /** You just sent a sticker; the bot may answer it. */
  | "reply";

/** Chance the bot stickers at each moment. */
export const BOT_STICKER_CHANCE: Record<BotStickerMoment, number> = {
  "match-start": 0.6,
  "bot-won-round": 0.45,
  "bot-lost-round": 0.3,
  "bot-won-match": 0.85,
  "bot-lost-match": 0.75,
  reply: 0.45,
};

/** The bot never stickers more often than this. */
export const BOT_STICKER_GAP_MS = 6000;

/** Delay before the bot's sticker appears (min, max), so it reads as a person reacting. */
export const BOT_STICKER_DELAY_MS = [700, 1900] as const;

/** Moods the bot picks from at each moment. */
const MOODS_FOR: Record<BotStickerMoment, StickerMood[]> = {
  "match-start": ["friendly", "think"],
  "bot-won-round": ["tease", "win"],
  "bot-lost-round": ["angry", "lose", "think"],
  "bot-won-match": ["win"],
  "bot-lost-match": ["lose", "friendly"],
  reply: ["tease"],
};

/** What the bot answers to each of YOUR moods. */
const REPLY_MOODS: Record<StickerMood, StickerMood[]> = {
  tease: ["angry", "tease"],
  win: ["angry", "think"],
  lose: ["tease", "win"],
  friendly: ["friendly"],
  think: ["tease", "think"],
  angry: ["tease", "win"],
};

/**
 * The sticker the bot sends at this moment, or null to stay quiet.
 *
 * @param moment       what just happened
 * @param chanceRoll   Math.random() — decides IF it stickers
 * @param pickRoll     Math.random() — decides WHICH sticker
 * @param msSinceLast  time since the bot's last sticker (Infinity if none)
 * @param yourMood     for "reply": the mood of the sticker you sent
 */
export function botStickerFor(input: {
  moment: BotStickerMoment;
  chanceRoll: number;
  pickRoll: number;
  msSinceLast: number;
  yourMood?: StickerMood;
}): Sticker | null {
  if (input.msSinceLast < BOT_STICKER_GAP_MS) return null;
  if (input.chanceRoll >= BOT_STICKER_CHANCE[input.moment]) return null;
  const moods = input.moment === "reply" && input.yourMood ? REPLY_MOODS[input.yourMood] : MOODS_FOR[input.moment];
  const pool = STICKERS.filter((sticker) => moods.includes(sticker.mood));
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(input.pickRoll * pool.length))];
}

/** A delay inside BOT_STICKER_DELAY_MS for the given roll. */
export function botStickerDelay(roll: number): number {
  const [min, max] = BOT_STICKER_DELAY_MS;
  return Math.round(min + (max - min) * Math.max(0, Math.min(1, roll)));
}