// Display helpers for the Inbox "Coverage" section. Pure.
//
// `newestDate` / `newestTime` are statement-local wall times, formatted from the strings directly.
// `lastStatementMailAt` and `finishedAt` are timestamptz instants, read in Asia/Bangkok.

import { dayNumber } from "@/lib/dates";
import type { BankCode } from "@/lib/statement-frame";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** `2026-03-13` -> `13 Mar`, from the string alone (never through `Date`). */
export function formatDayMonth(date: string): string {
  const month = MONTHS[Number(date.slice(5, 7)) - 1] ?? "";
  return `${Number(date.slice(8, 10))} ${month}`;
}

/** `21:40:00` -> `21:40`, from the string alone. */
export function formatWallTime(time: string): string {
  return time.slice(0, 5);
}

function bangkokParts(instant: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(instant));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

/** A timestamptz as its Bangkok `d Mon`. */
export function formatInstantDay(instant: string): string {
  return formatDayMonth(bangkokParts(instant).date);
}

/** A timestamptz as its Bangkok `d Mon HH:mm`. */
export function formatInstantDayTime(instant: string): string {
  const { date, time } = bangkokParts(instant);
  return `${formatDayMonth(date)} ${time}`;
}

/** "just now" under a minute, then "N minutes/hours/days ago" (floored; singular at 1). */
export function relativeAge(instant: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(instant).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (minutes < 60) return unit(minutes, "minute");
  if (minutes < 1440) return unit(Math.floor(minutes / 60), "hour");
  return unit(Math.floor(minutes / 1440), "day");
}

/** Whole calendar days from `newestDate` to `today` (both `YYYY-MM-DD`). */
export function coverageAgeDays(newestDate: string, today: string): number {
  return dayNumber(today) - dayNumber(newestDate);
}

/** "today" | "1 day" | "N days", on calendar dates. A row dated after today (a posting date ahead) reads "today". */
export function coverageAge(newestDate: string, today: string): string {
  const days = coverageAgeDays(newestDate, today);
  if (days <= 0) return "today";
  return dayCount(days);
}

/** "1 day" | "N days". */
export function dayCount(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * How far a statement requested today would reach, per bank (GOTCHAS "A Krungthai statement's period
 * end is the requested range"): KBANK and SCB end the day before the request, SCB leaving out rows
 * after about 23:00 on that day; KTB runs to the request. `null` when the account's bank is unknown.
 * A Record, so a bank added to `BANK_CODES` fails tsc here until it has a rule.
 */
export function requestNowReach(bankCode: BankCode | null, today: string): string | null {
  if (bankCode === null) return null;
  const yesterday = formatDayMonth(new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
  const reach: Record<BankCode, string> = { KBANK: `end of ${yesterday}`, SCB: `${yesterday} ~23:00`, KTB: "now" };
  return `Requested now: up to ${reach[bankCode]}`;
}

/** The warning days an account has until the owner sets its own (matches migration 065's default). */
export const DEFAULT_COVERAGE_WARN_DAYS = 35;

/** "done" up to `warnAfterDays` days old (inclusive), "check" beyond. */
export function coverageTone(ageDays: number, warnAfterDays: number): "done" | "check" {
  return ageDays <= warnAfterDays ? "done" : "check";
}
