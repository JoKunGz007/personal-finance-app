import { z } from "zod";

/**
 * How the section nav is laid out at phone width, and the one place that decides it.
 *
 * **Strip** is the default (owner chose it on 2026-10-04): one swipeable row, so the header costs one
 * line of the first screen whatever the typeface. **Grid** is D-226's three-column grid, chosen on
 * 2026-09-25 and replaced as the default the same fortnight. It stays selectable on purpose: the
 * choice was made from renderings of invented data, and the real test is his own ledger on his own
 * phone. Desktop is unaffected by either.
 *
 * Same shape as `lib/ui-theme.ts` and for the same reasons: an httpOnly cookie read server-side so the
 * `data-nav` attribute on `<html>` is right on first paint, a closed set so the only thing that can
 * reach the DOM is a known token, and its own strict route rather than loosening another's schema.
 */
export const NAV_CHOICES = ["strip", "grid"] as const;

export type NavChoice = (typeof NAV_CHOICES)[number];

export const DEFAULT_NAV: NavChoice = "strip";

/** Prefixed so it cannot collide with a Supabase auth cookie. */
export const NAV_COOKIE = "pl_ui_nav";

/** A year, matching the typeface and scheme cookies. */
export const NAV_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const NAV_LABELS: Record<NavChoice, string> = {
  strip: "Strip",
  grid: "Grid"
};

export const NAV_NOTES: Record<NavChoice, string> = {
  strip: "One swipeable row of sections.",
  grid: "Three columns, every section visible."
};

export function isNavChoice(value: unknown): value is NavChoice {
  return typeof value === "string" && (NAV_CHOICES as readonly string[]).includes(value);
}

/** Total over untrusted input: anything that is not a known token is the default. */
export function navChoiceFrom(value: string | undefined | null): NavChoice {
  return isNavChoice(value) ? value : DEFAULT_NAV;
}

export const navPreferenceRequestSchema = z.object({ nav: z.enum(NAV_CHOICES) }).strict();

export const navPreferenceResponseSchema = z.object({ nav: z.enum(NAV_CHOICES) }).strict();

export type NavPreferenceResponse = z.infer<typeof navPreferenceResponseSchema>;
