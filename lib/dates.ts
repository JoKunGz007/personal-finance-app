import { z } from "zod";

export const isoDateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}, "Date must be a real ISO calendar date.");

export function resolveKrungthaiYear(twoDigitYear: number, statementEndYear: number): number {
  if (!Number.isInteger(twoDigitYear) || twoDigitYear < 0 || twoDigitYear > 99) throw new Error("Invalid two-digit year.");
  const buddhistCentury = Math.floor((statementEndYear + 543) / 100) * 100;
  const gregorian = buddhistCentury + twoDigitYear - 543;
  if (Math.abs(gregorian - statementEndYear) > 50) {
    return gregorian + (gregorian < statementEndYear ? 100 : -100);
  }
  return gregorian;
}

export function bangkokInstant(date: string, time: string | null): string {
  isoDateSchema.parse(date);
  const normalizedTime = time ?? "00:00:00";
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(normalizedTime)) throw new Error("Invalid source time.");
  return `${date}T${normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime}+07:00`;
}
