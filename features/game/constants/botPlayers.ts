/**
 * Stand-in online opponents.
 *
 * When PLAY ONLINE finds nobody before the search clock runs out, most of the
 * time (BOT_MATCH_CHANCE) the player is seated against the computer wearing one
 * of these profiles, so an empty lobby still feels alive. The rest of the time
 * they see "No player found" and can search again.
 *
 * ── GUARDRAIL ──────────────────────────────────────────────────────────────
 * This is acceptable ONLY while online play has nothing at stake (no wallet
 * currency, entry fees or prizes). The day any mode puts real value on a match
 * — the Wallet and Tournament are both "coming soon" — set
 * DISGUISED_BOT_ENABLED to false for that mode. Passing a bot off as a person in
 * a match with stakes would mislead players about what they are paying for.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * `image` is optional: drop an ILLUSTRATED avatar (never a real person's photo)
 * at /public/avatars/<id>.webp and set it here. Without one, PlayerAvatar draws
 * the player's initials on their colour.
 */

export const DISGUISED_BOT_ENABLED = true;

/** Share of empty searches that are seated against a stand-in player (0.8 = 80%). */
export const BOT_MATCH_CHANCE = 0.8;

export interface BotPlayer {
  /** Stable id, used in the URL (?opp=) and for an optional /avatars/<id>.webp. */
  id: string;
  /** Name shown to the player, styled like names people really type. */
  name: string;
  city: string;
  /** Avatar background hue (0–360) for the initials fallback. */
  hue: number;
  /** Optional illustrated avatar, e.g. "/avatars/aarav.webp". */
  image?: string;
}

export const BOT_PLAYERS: readonly BotPlayer[] = [
  { id: "aarav", name: "Aarav", city: "Mumbai", hue: 28 },
  { id: "priya", name: "Priya_22", city: "Pune", hue: 330 },
  { id: "rohit", name: "Rohit K", city: "Delhi", hue: 210 },
  { id: "ananya", name: "Ananya", city: "Bengaluru", hue: 280 },
  { id: "vikram", name: "Vikram", city: "Jaipur", hue: 12 },
  { id: "sneha", name: "Sneha", city: "Hyderabad", hue: 300 },
  { id: "arjun", name: "Arjun_07", city: "Lucknow", hue: 190 },
  { id: "kavya", name: "Kavya", city: "Chennai", hue: 160 },
  { id: "rahul", name: "Rahul S", city: "Indore", hue: 40 },
  { id: "ishita", name: "Ishita", city: "Kolkata", hue: 350 },
  { id: "karan", name: "Karan", city: "Chandigarh", hue: 230 },
  { id: "meera", name: "Meera", city: "Ahmedabad", hue: 140 },
  { id: "aditya", name: "Aditya", city: "Bhopal", hue: 20 },
  { id: "pooja", name: "Pooja R", city: "Nagpur", hue: 320 },
  { id: "siddharth", name: "Siddharth", city: "Kochi", hue: 175 },
  { id: "neha", name: "Neha", city: "Surat", hue: 290 },
  { id: "harsh", name: "Harsh_99", city: "Patna", hue: 50 },
  { id: "diya", name: "Diya", city: "Udaipur", hue: 0 },
  { id: "manish", name: "Manish", city: "Ranchi", hue: 200 },
  { id: "tanvi", name: "Tanvi", city: "Nashik", hue: 270 },
  { id: "yash", name: "Yash", city: "Vadodara", hue: 35 },
  { id: "riya", name: "Riya", city: "Dehradun", hue: 310 },
  { id: "kunal", name: "Kunal", city: "Guwahati", hue: 220 },
  { id: "simran", name: "Simran", city: "Amritsar", hue: 150 },
];

/** Pick a stand-in player. `roll` is Math.random() at the call site (keeps this pure). */
export function pickBotPlayer(roll: number): BotPlayer {
  const index = Math.min(BOT_PLAYERS.length - 1, Math.floor(roll * BOT_PLAYERS.length));
  return BOT_PLAYERS[index];
}

/** Look a stand-in up by its URL id; null for unknown ids. */
export function botPlayerById(id: string | null | undefined): BotPlayer | null {
  if (!id) return null;
  return BOT_PLAYERS.find((player) => player.id === id) ?? null;
}

/** Whether an empty search is seated against a stand-in (true) or shown "No player found". */
export function seatAgainstBot(roll: number): boolean {
  return DISGUISED_BOT_ENABLED && roll < BOT_MATCH_CHANCE;
}

/** Up to two initials for the avatar fallback ("Rohit K" → "RK", "Priya_22" → "P"). */
export function initialsOf(name: string): string {
  const words = name.replace(/[^A-Za-z\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") || "?";
}