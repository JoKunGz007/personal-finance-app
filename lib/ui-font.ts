import { z } from "zod";

/**
 * Which typeface the interface is drawn in, and the one place that decides it.
 *
 * ## Why this is a cookie and not a row
 *
 * **A typeface is a fact about the screen, not about the ledger.** The same owner reading on a phone
 * and on a desktop may want different answers — a pixel face that is comfortable at arm's length on
 * a monitor is not the same proposition at 390px — so a per-device preference is the *correct*
 * semantics here rather than the cheap one. A row in PostgreSQL would force one answer across every
 * device and then need overriding.
 *
 * The cost side agrees. A row would mean migration 021 on every project including hosted, a decision
 * about whether the table joins `BACKUP_TABLE_KINDS` (versioned v2→v6 purely by accretion, so a new
 * table is a contract question rather than a detail), RLS and an owner-bound RPC to satisfy the
 * boundary rule, and pgTAP coverage — to store one of four known words.
 *
 * ## Why it is not `localStorage`
 *
 * `tests/privacy.test.ts` forbids every client storage API across `app/`, and **the guard is only
 * worth having while it is a blanket grep**. "No client storage except this one" cannot be checked
 * by the same rule, and the next thing stored there would have no tripwire — which is the failure
 * D-148, D-151 and D-152 all record in different clothes. A server-set cookie keeps `app/` free of
 * storage APIs entirely, and it resolves before first paint, so there is no flash of the wrong face
 * to fix with a blocking inline script the CSP would then have to admit.
 *
 * ## The allowlist is the security story
 *
 * The chosen value reaches the DOM as an attribute on `<html>`. React escapes attribute values, so
 * this is not an injection vector — but a cookie is client-supplied input, and the honest form of
 * "we trust it" is a closed set with a default. `fontChoiceFrom` never returns anything but a member
 * of `FONT_CHOICES`, whatever it is handed, and that is what the route, the layout and the tests all
 * go through.
 */

/**
 * Every face the interface can be drawn in.
 *
 * `system` is the established stack and stays **first and default**: the pixel faces are on trial
 * (PLAN task 42), and the way back to something plainly legible must not itself depend on the trial
 * going well. The other three are the OFL pixel faces the owner compared on the design canvas.
 */
export const FONT_CHOICES = ["system", "press-start-2p", "pixelify-sans", "silkscreen"] as const;

export type FontChoice = (typeof FONT_CHOICES)[number];

/**
 * What a device with no preference gets.
 *
 * **Decided by the owner on 2026-08-29: Pixelify Sans, and not the candidate he had been leaning
 * to.** The question this constant carried was whether Press Start 2P became the default; the
 * answer chose the third face instead, which is why the question is closed rather than confirmed
 * (D-169). Pixelify Sans is the pixel face closest to ordinary proportions, so it reads as a
 * decision about character rather than a legibility trade — Press Start 2P advances a full em per
 * glyph, which is what forced figures down to 8px, and imposing that on a device nobody has picked
 * a face on is the cost this default exists to avoid.
 *
 * **The trial argument still holds and now runs the other way.** Any face here can be chosen in one
 * gesture and the cookie remembers it per device, so a default is a starting point rather than a
 * commitment. What must stay true is that the way back to something legible does not depend on the
 * default going well: `system` remains in `FONT_CHOICES` and is one press away.
 *
 * **Latin only, so Thai falls back** — which is not a regression here, because every switched stack
 * keeps IBM Plex Sans Thai behind the pixel face (D-153). Thai reaches this app as data, never as
 * interface copy.
 */
export const DEFAULT_FONT: FontChoice = "pixelify-sans";

/** The cookie the layout reads. Prefixed so it cannot collide with a Supabase auth cookie. */
export const FONT_COOKIE = "pl_ui_font";

/** A year: long enough that it is a setting rather than a session, short enough to lapse if unused. */
export const FONT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** What the picker calls each face. The value is a token; only this is ever shown. */
export const FONT_LABELS: Record<FontChoice, string> = {
  system: "System (IBM Plex)",
  "press-start-2p": "Press Start 2P",
  "pixelify-sans": "Pixelify Sans",
  silkscreen: "Silkscreen"
};

/**
 * A one-line note under the picker, because the trade is not visible until you hit it.
 *
 * The pixel faces cover **Latin only**. Thai reaches the screen as statement data — counterparty
 * names, notes — and falls back to IBM Plex Sans Thai mid-line, which is how it will look. Saying so
 * beside the control is cheaper than the owner discovering it in a table and reading it as a defect.
 */
export const FONT_NOTES: Record<FontChoice, string> = {
  system: "The stack this app has always used. Latin and Thai in one family.",
  "press-start-2p": "Widest of the three. Latin only — Thai falls back to IBM Plex Sans Thai.",
  "pixelify-sans": "Closest to ordinary proportions. Latin only — Thai falls back.",
  silkscreen: "Tightest of the three. Latin only — Thai falls back."
};

export function isFontChoice(value: unknown): value is FontChoice {
  return typeof value === "string" && (FONT_CHOICES as readonly string[]).includes(value);
}

/**
 * The chosen face, from anything at all.
 *
 * Takes `undefined` (no cookie), `null`, and any string a client cares to send, and answers with a
 * member of `FONT_CHOICES` every time. **There is no failure branch on purpose**: a preference that
 * cannot be read is not an error to report, it is a device that gets the default.
 */
export function fontChoiceFrom(value: string | undefined | null): FontChoice {
  return isFontChoice(value) ? value : DEFAULT_FONT;
}

/** The request body the picker sends. Strict, so an unknown key is a refusal rather than ignored. */
export const fontPreferenceRequestSchema = z.object({ font: z.enum(FONT_CHOICES) }).strict();

/** What the route answers with: the face it actually stored, which the client renders from. */
export const fontPreferenceResponseSchema = z.object({ font: z.enum(FONT_CHOICES) }).strict();

export type FontPreferenceResponse = z.infer<typeof fontPreferenceResponseSchema>;
