import { z } from "zod";

/**
 * Which colour scheme the interface is drawn in, and the one place that decides it.
 *
 * ## Why this reverses a decision rather than adding a feature
 *
 * **D-137 dropped the dark scheme**, and its stated argument was a good one: a second scheme is a
 * second set of contrast facts that nothing here measures. A later entry removed the *"but we'll
 * see"* hedge the owner had attached, on the understanding that he would say so if it changed.
 * He said so. What answers D-137's argument is not enthusiasm but `tests/ui-theme.test.ts`, which
 * measures **every** declared scheme against the floors the shipped light palette establishes — so
 * the facts are no longer unmeasured, and a fourth scheme costs one CSS block plus one entry here.
 *
 * ## Why three darks and not one
 *
 * The owner compared three Stardew-grounded candidates on a design canvas and chose Night Town.
 * The other two are kept **reachable rather than deleted**, because the choice was made from
 * renderings of invented data on a desktop and the real test is his own ledger on his own phone at
 * night. A palette that can only be re-evaluated by editing CSS and redeploying will not be
 * re-evaluated. All three are held to the identical floors, so switching between them can never
 * ship an unmeasured scheme.
 *
 * ## Why this mirrors `lib/ui-font.ts` exactly
 *
 * Same shape, same reasons, and the parallel is deliberate: a cookie rather than a row (a scheme is
 * a fact about the screen, not about the ledger, and the same owner may want different answers on a
 * phone and a monitor); httpOnly and server-read, so it resolves **before first paint** and there is
 * no flash of the wrong ground; not client storage, because `tests/privacy.test.ts` forbids every
 * such API across `app/` and that guard is only worth having while it stays a blanket grep.
 *
 * The one thing that is **not** shared is the endpoint. `fontPreferenceRequestSchema` is `.strict()`
 * and its route's docstring names `{font, theme}` as the exact shape it refuses — written before
 * this module existed, and right. A theme is a second preference, so it gets a second route rather
 * than loosening the first.
 */

/**
 * Every scheme the interface can be drawn in.
 *
 * `system` stays **first and default**: a preference nobody has expressed should follow the device,
 * and the way back to the palette this app shipped for its whole life must not depend on a choice
 * going well. `light` is the cornsilk almanac of D-136/D-137, unchanged. The last three are dark.
 */
export const THEME_CHOICES = ["system", "light", "night", "lamplit", "cellar"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

/**
 * The dark members, named separately because three things need to know which schemes are dark:
 * `color-scheme` (so native date pickers and selects follow), the `themeColor` meta, and the test
 * that measures ink against ground.
 */
export const DARK_THEMES = ["night", "lamplit", "cellar"] as const;

export type DarkTheme = (typeof DARK_THEMES)[number];

/**
 * Which dark scheme `system` resolves to when the device asks for dark.
 *
 * **Chosen by the owner on 2026-09-01: Night Town**, from three candidates rendered on the real app
 * surfaces. Changing this constant is *not* the whole of changing the default, and that is the one
 * trap here: `globals.css` cannot alias one rule to another, so the tokens for this scheme are
 * written twice — once under `[data-theme="night"]` and once inside
 * `@media (prefers-color-scheme: dark)` for `[data-theme="system"]`. `tests/ui-theme.test.ts`
 * asserts the two blocks agree, so the duplication cannot drift silently.
 */
export const SYSTEM_DARK: DarkTheme = "night";

/** What a device with no preference gets: whatever its own OS asks for. */
export const DEFAULT_THEME: ThemeChoice = "system";

/** The cookie the layout reads. Prefixed so it cannot collide with a Supabase auth cookie. */
export const THEME_COOKIE = "pl_ui_theme";

/** A year, matching the typeface cookie: a setting rather than a session, lapsing if unused. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** What the picker calls each scheme. The value is a token; only this is ever shown. */
export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: "System",
  light: "Daylight",
  night: "Night Town",
  lamplit: "Lamplit",
  cellar: "Cellar"
};

/**
 * A one-line note under the picker.
 *
 * Kept to **one short line each** deliberately. PLAN task 49 measured that width-capped prose in a
 * header box occupies a face-dependent number of lines and reflows every landmark below it — which
 * is why `FONT_NOTES` moved behind the `(i)` disclosure. These notes go behind the same disclosure
 * for the same reason, and staying short keeps them one line in every one of the four typefaces.
 */
export const THEME_NOTES: Record<ThemeChoice, string> = {
  system: "Follows the device: daylight by day, Night Town after dark.",
  light: "The cornsilk almanac this app has always used.",
  night: "Deep blue-violet, the valley after dark. Warm accents read as lamplight.",
  lamplit: "Dark walnut and cornsilk ink — the wooden interior, warm throughout.",
  cellar: "Near-black green, built by darkening the ink this app writes in."
};

/**
 * The ground colour each scheme paints, for the `themeColor` meta tag.
 *
 * **This is the duplication that has already gone wrong once.** `themeColor` tints the browser's own
 * chrome around the page on a phone, so a stale value shows as a band in the wrong colour above the
 * app — and no screenshot can catch it, because a headless capture renders the page and never the
 * chrome. It sat at the pre-retheme blue-grey for a full day across two deployments (D-137, and the
 * `GOTCHAS.md` trap "a colour declared outside the stylesheet does not move when the stylesheet
 * does"). `tests/ui-theme.test.ts` now reads `--mist` out of each block in `app/globals.css` and
 * asserts it equals the value here, which is the check that was missing that day.
 */
export const THEME_GROUNDS: Record<Exclude<ThemeChoice, "system">, string> = {
  light: "#fefae0",
  night: "#1e2440",
  lamplit: "#2b2018",
  cellar: "#1a2110"
};

/**
 * Every colour custom property a scheme must declare, in the order `globals.css` declares them.
 *
 * **A scheme that omits one inherits the light value**, which is how a dark page ends up with one
 * cornsilk surface nobody notices in review. The test asserts every block declares exactly this
 * set — no more, no less — so adding a token means adding it everywhere or failing loudly.
 *
 * The seven after `money-out` were **literal colours sitting outside `:root` until 2026-09-01**.
 * Promoting them is the whole of the `GOTCHAS.md` trap "a token that inverts between colour schemes
 * makes every hardcoded partner a latent failure": a rule pairing `var(--saffron-wash)` with
 * `color: #7a4a12` is correct in light and unreadable in dark, and the file had eleven of them.
 */
export const THEME_TOKENS = [
  "mist", "paper", "paper-strong",
  "navy", "muted", "line",
  "blue", "blue-dark",
  "celadon", "celadon-ink",
  "saffron", "saffron-wash", "red",
  "frame-outer", "frame-inner",
  "money-in", "money-out",
  "on-action", "warn-ink", "resync-ink",
  "verified-ink", "verified-rail", "celadon-dot", "backup-edge", "scrim",
  "chart-in", "chart-out"
] as const;

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && (THEME_CHOICES as readonly string[]).includes(value);
}

export function isDarkTheme(value: ThemeChoice): value is DarkTheme {
  return (DARK_THEMES as readonly string[]).includes(value);
}

/**
 * The chosen scheme, from anything at all.
 *
 * Takes `undefined` (no cookie), `null`, and any string a client cares to send, and answers with a
 * member of `THEME_CHOICES` every time. **There is no failure branch on purpose**: a preference that
 * cannot be read is not an error to report, it is a device that gets the default. The value reaches
 * the DOM as an attribute on `<html>`; React escapes attribute values, so this is not an injection
 * vector today — but "it is escaped downstream" is a property of a renderer someone can change, and
 * a closed set is a property of this function that they cannot.
 */
export function themeChoiceFrom(value: string | undefined | null): ThemeChoice {
  return isThemeChoice(value) ? value : DEFAULT_THEME;
}

/**
 * What `color-scheme` must say for this choice.
 *
 * This is not decoration: it is what makes a native date picker and a `<select>` dropdown render in
 * the same scheme as the page. `light dark` for `system` lets the device decide both the tokens (via
 * the media query) and the native controls with one answer; a pinned scheme names itself, so
 * choosing Daylight on a dark-OS phone gets light controls rather than dark ones on a cream page.
 */
export function colorSchemeFor(theme: ThemeChoice): "light" | "dark" | "light dark" {
  if (theme === "system") return "light dark";
  return isDarkTheme(theme) ? "dark" : "light";
}

/** The request body the picker sends. Strict, so an unknown key is a refusal rather than ignored. */
export const themePreferenceRequestSchema = z.object({ theme: z.enum(THEME_CHOICES) }).strict();

/** What the route answers with: the scheme it actually stored, which the client renders from. */
export const themePreferenceResponseSchema = z.object({ theme: z.enum(THEME_CHOICES) }).strict();

export type ThemePreferenceResponse = z.infer<typeof themePreferenceResponseSchema>;
