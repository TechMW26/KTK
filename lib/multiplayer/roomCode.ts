import { ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET, type RoomData } from "./types";

/**
 * Short, human-readable room-code generation (e.g. "A7K92X").
 *
 * The alphabet deliberately omits ambiguous characters: 0/O, 1/I/L. Digits and
 * letters keep codes short but typeable on both a phone keypad and desktop.
 */

function randomChar(): string {
  return ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
}

/** Generate a single random code. */
export function generateRoomCode(length = ROOM_CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i += 1) code += randomChar();
  return code;
}

/** Upper-case + strip whitespace/hyphens so "a7k 92- x" becomes "A7K92X". */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCodeFormat(input: string): boolean {
  const normalized = normalizeRoomCode(input);
  if (normalized.length !== ROOM_CODE_LENGTH) return false;
  for (const char of normalized) {
    if (!ROOM_CODE_ALPHABET.includes(char)) return false;
  }
  return true;
}

/** Pull the code back out of a room snapshot for convenient display. */
export function roomCodeOf(room: RoomData): string {
  return room.code;
}
