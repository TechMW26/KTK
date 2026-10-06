/**
 * Date-of-birth handling for the Account screen.
 *
 * Separate from the component so the formatting and the validation are testable
 * without a React tree, and so there is exactly one definition of "valid" for
 * both the field and the save path.
 */

/** The maximum age accepted, to reject obvious typos like the year 1200. */
const MAX_AGE_YEARS = 120;

/** Pad to two digits for the DD / MM / YYYY field. */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Turn a stored "YYYY-MM-DD" into the "DD / MM / YYYY" the player types and
 * reads. Returns "" for anything malformed so the field renders empty rather
 * than showing a broken string.
 */
export function toFriendlyDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day} / ${month} / ${year}`;
}

/**
 * Parse "DD / MM / YYYY" (or "DD/MM/YYYY", or with dashes) into "YYYY-MM-DD".
 *
 * Returns null when unparseable OR not a real calendar date: `new Date(2001, 1,
 * 30)` would silently roll over to March 2, so the round-trip is checked instead
 * of trusted.
 */
export function parseFriendlyDate(input: string): string | null {
  const match = /^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})$/.exec(input.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return real ? `${year}-${pad(month)}-${pad(day)}` : null;
}

/**
 * Whether a stored "YYYY-MM-DD" is a usable birthday: a real calendar date that
 * is not in the future and not implausibly old.
 */
export function isValidDateOfBirth(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  // Re-running the parse rejects stored dates like 2001-02-30.
  if (parseFriendlyDate(`${match[3]} / ${match[2]} / ${match[1]}`) !== iso) return false;

  const date = new Date(`${iso}T00:00:00Z`);
  const now = new Date();
  if (date.getTime() > now.getTime()) return false;

  const oldest = new Date(Date.UTC(now.getUTCFullYear() - MAX_AGE_YEARS, now.getUTCMonth(), now.getUTCDate()));
  return date.getTime() >= oldest.getTime();
}

/** Today as "YYYY-MM-DD", for the date input's `max`. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}
