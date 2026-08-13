import { z } from "zod";

export const isoDateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}, "Date must be a real ISO calendar date.");

// Which calendar a statement's two-digit years are printed in. A Thai bank prints either,
// depending on the document language: a Thai-language statement dates July 2026 as `69`
// (Buddhist 2569) and an English-language one as `26`. Reading one as the other is a silent
// 43-year error on every date in the file, which is why the era is resolved explicitly and
// then applied to every date in the statement rather than inferred per date.
export type StatementEra = "gregorian" | "buddhist";

// The Buddhist calendar runs 543 years ahead, so the two readings of the same two digits
// are always exactly 543 years apart. A window narrower than that can therefore admit at
// most one of them — which is what makes this a determination rather than a guess.
const MAX_STATEMENT_AGE_YEARS = 20;
// Tolerates a statement generated just after a new year, or a skewed local clock.
const MAX_STATEMENT_FUTURE_YEARS = 1;

function assertTwoDigit(twoDigitYear: number): void {
  if (!Number.isInteger(twoDigitYear) || twoDigitYear < 0 || twoDigitYear > 99) throw new Error("Invalid two-digit year.");
}

// Places two digits in the century that puts them nearest `anchor`, so `98` against 2003
// reads as 1998 rather than 2098.
function nearestCentury(twoDigitYear: number, anchor: number, offset: number): number {
  const base = Math.floor((anchor + offset) / 100) * 100;
  const candidate = base + twoDigitYear - offset;
  if (Math.abs(candidate - anchor) > 50) return candidate + (candidate < anchor ? 100 : -100);
  return candidate;
}

export function gregorianYearFrom(twoDigitYear: number, anchorYear: number, era: StatementEra): number {
  assertTwoDigit(twoDigitYear);
  return nearestCentury(twoDigitYear, anchorYear, era === "buddhist" ? 543 : 0);
}

// Decides the era from the statement's own period-end year against the current year. Both
// readings are produced and exactly one must land inside the plausible window; if neither
// does, or somehow both do, this throws rather than picking — a wrong era is not a
// recoverable error, it silently redates every transaction in the import.
export function resolveStatementEra(twoDigitYear: number, currentYear: number): { era: StatementEra; year: number } {
  assertTwoDigit(twoDigitYear);
  const candidates: Array<{ era: StatementEra; year: number }> = [
    { era: "gregorian", year: gregorianYearFrom(twoDigitYear, currentYear, "gregorian") },
    { era: "buddhist", year: gregorianYearFrom(twoDigitYear, currentYear, "buddhist") }
  ];
  const plausible = candidates.filter(({ year }) =>
    year <= currentYear + MAX_STATEMENT_FUTURE_YEARS && year >= currentYear - MAX_STATEMENT_AGE_YEARS);

  if (plausible.length === 1) return plausible[0]!;
  if (plausible.length === 0) {
    throw new Error("A two-digit statement year read as neither a plausible Gregorian nor Buddhist year.");
  }
  // Unreachable while the window stays narrower than the 543-year separation. Guarded
  // rather than assumed, because widening the window would make it reachable silently.
  throw new Error("A two-digit statement year is ambiguous between the Gregorian and Buddhist calendars.");
}

/**
 * An ISO date as a whole number of days, so two dates can be subtracted.
 *
 * Built from `Date.UTC` on the date parts alone rather than by parsing the string, so no local
 * time zone can shift it across a day boundary — the reconciliation rules compare a captured
 * record's date with a statement row's, and a rule that read differently in two time zones
 * would move a match without anything saying so.
 *
 * Shared by `lib/slip-reconcile.ts` and `lib/notification-card-reconcile.ts`, which both measure
 * a date distance against a window. Two hand-kept copies of this would be two chances to
 * disagree about what "one day apart" means.
 */
export function dayNumber(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000;
}

export function bangkokInstant(date: string, time: string | null): string {
  isoDateSchema.parse(date);
  const normalizedTime = time ?? "00:00:00";
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(normalizedTime)) throw new Error("Invalid source time.");
  return `${date}T${normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime}+07:00`;
}
