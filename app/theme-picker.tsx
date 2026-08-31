"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LedgerNote } from "@/app/ledger-note";
import { ledgerRequest } from "@/lib/wire";
import {
  THEME_CHOICES,
  THEME_LABELS,
  THEME_NOTES,
  themePreferenceResponseSchema,
  type ThemeChoice
} from "@/lib/ui-theme";

/**
 * Chooses the colour scheme the interface is drawn in (2026-09-01, reversing D-137).
 *
 * **A deliberate copy of `app/font-picker.tsx`, down to the state machine.** The two controls sit
 * beside each other, do the same job for a different preference, and every failure mode this one can
 * have was already found and fixed in that one — the pending display that must show the in-flight
 * choice but not an unstored one, the `stale` read that catches a stored cookie the view never
 * picked up, the note that must be a sibling of the `<label>` rather than inside it. Sharing an
 * abstraction between them would mean generalising over "the thing being picked" before there is a
 * third; **repeating the shape is the cheaper mistake to unmake**, and if a third preference ever
 * arrives the two of these are the evidence for what to extract.
 *
 * The server owns the answer and this control only asks: the route writes an httpOnly cookie and
 * replies with the scheme it stored, `router.refresh()` re-runs the layout, and the layout rewrites
 * `data-theme` on `<html>`. So the rendered scheme always comes from the server's word, and a
 * refusal leaves the page exactly as it was rather than showing a scheme nobody stored.
 */
export function ThemePicker({ value }: { value: ThemeChoice }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  /** What the owner chose, held only while the round trip is in flight. */
  const [chosen, setChosen] = useState<ThemeChoice | null>(null);
  /** True from the first change to the end of the refresh, so the two halves cannot leave a gap. */
  const [saving, setSaving] = useState(false);

  const busy = saving || pending;
  // `chosen` outliving the refresh means the layout came back on the old scheme: the cookie is
  // stored but this view did not re-render, which is the one failure `router.refresh()` cannot
  // report because it returns nothing to await. Nothing clears `chosen` and nothing needs to —
  // once the refresh lands, `value` *is* what was chosen (see `app/font-picker.tsx`).
  const stale = !busy && chosen !== null && chosen !== value;

  async function choose(next: ThemeChoice) {
    setFailure(null);
    setChosen(next);
    setSaving(true);
    try {
      const result = await ledgerRequest("/api/v1/ui/theme", themePreferenceResponseSchema, {
        fallback: "That colour scheme could not be saved.",
        unreachable: "The app could not be reached, so the colour scheme was not changed."
      }, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: next })
      });
      if (!result.ok) {
        setFailure(result.why);
        setChosen(null);
        return;
      }
      // The layout re-reads the cookie and rewrites the attribute. Nothing here touches the DOM,
      // and in particular nothing here writes a colour: every scheme lives in `globals.css`.
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  // "Stored, but this view did not pick it up" is kept in full, because *nothing visible changed*
  // reads identically to a refusal and the two have opposite remedies (D-147). It is louder here
  // than for the typeface: a scheme that did not apply is the entire visible surface of the app.
  const message = failure
    ?? (stale ? `${THEME_LABELS[chosen]} is saved. Reload to see it — this page could not refresh itself.` : null);

  return (
    <div className="ui-picker theme-picker">
      <label>
        <span>Colours</span>
        <select
          value={chosen ?? value}
          disabled={busy}
          onChange={(event) => void choose(event.target.value as ThemeChoice)}
          aria-describedby="theme-picker-note"
        >
          {THEME_CHOICES.map((choice) => (
            <option key={choice} value={choice}>{THEME_LABELS[choice]}</option>
          ))}
        </select>
      </label>
      {/* **A sibling of the `<label>`, never inside it.** A `<label>`'s accessible name is computed
          from its subtree, so a disclosure button inside it joins the select's name — announced as
          "Colours About this scheme", plus the whole note once open. axe reports no violation for
          it, so "the suites run axe" is not evidence here; only reading the computed name is
          (D-156, and the `GOTCHAS.md` trap on descendant names). A `<button>` is also a labelable
          element, so a label containing both breaks the HTML content model. */}
      <LedgerNote label="About these colours">{THEME_NOTES[value]}</LedgerNote>
      {/* `aria-live` rather than `role="status"`: this shell already carries status regions, and a
          second computes to the same role and makes every unscoped `getByRole("status")` in the
          browser suite ambiguous (GOTCHAS). Always rendered and clipped when empty, so
          `aria-describedby` never points at an absent id and the region is present before it has
          news. */}
      <p id="theme-picker-note" className="field-help" aria-live="polite">{message}</p>
    </div>
  );
}
