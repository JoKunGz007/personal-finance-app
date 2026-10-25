// Display helpers for the Inbox "Coverage" section. Pure.
//
// `newestDate` / `newestTime` are statement-local wall times, formatted from the strings directly.
// `lastStatementMailAt` and `finishedAt` are timestamptz instants, read in Asia/Bangkok.

import { dayNumber } from "@/lib/dates";

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
  return days === 1 ? "1 day" : `${days} days`;
}

/** "done" up to 7 days old, "check" beyond. */
export function coverageTone(ageDays: number): "done" | "check" {
  return ageDays <= 7 ? "done" : "check";
}
