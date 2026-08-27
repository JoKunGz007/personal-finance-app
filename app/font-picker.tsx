"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LedgerNote } from "@/app/ledger-note";
import { ledgerRequest } from "@/lib/wire";
import {
  FONT_CHOICES,
  FONT_LABELS,
  FONT_NOTES,
  fontPreferenceResponseSchema,
  type FontChoice
} from "@/lib/ui-font";

/**
 * Chooses the typeface the interface is drawn in (PLAN task 42).
 *
 * **The server owns the answer and this control only asks.** The route writes an httpOnly cookie and
 * replies with the face it actually stored; `router.refresh()` then re-runs the layout, which reads
 * that cookie and rewrites `data-font` on `<html>`. So the rendered face always comes from the
 * server's word rather than from what this component hoped it sent, and a refusal leaves the page
 * exactly as it was instead of showing a face that is not stored anywhere.
 *
 * Nothing is kept in the browser. `tests/privacy.test.ts` forbids every client storage API across
 * `app/` and that guard is only worth having while it stays a blanket grep — see `lib/ui-font.ts`.
 *
 * **The in-flight choice is shown, the unstored one is not**, and the difference is the whole of the
 * `chosen` state below. While the POST is running the control is disabled and displays what was
 * clicked — that is a pending state, not a claim. The moment it *fails* the display falls back to
 * `value`, the server's word, because a control still showing a face nobody stored is the D-147
 * shape: it would disagree with the page around it and the way back would be a reload the owner has
 * no reason to try. An earlier draft refused the pending display too, which was the wrong lesson
 * from the right entry — and it left the select snapping back to the old face for the whole request
 * with no busy affordance, which invites a second click and a second concurrent POST.
 */
export function FontPicker({ value }: { value: FontChoice }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  /** What the owner clicked, held only while the round trip is in flight. */
  const [chosen, setChosen] = useState<FontChoice | null>(null);
  /** True from the first keystroke to the end of the refresh, so the two halves cannot leave a gap. */
  const [saving, setSaving] = useState(false);

  const busy = saving || pending;
  // `chosen` outliving the refresh means the layout came back still on the old face: the cookie is
  // stored but this view did not re-render, which is the one failure `router.refresh()` cannot
  // report because it returns nothing to await.
  //
  // **Nothing clears `chosen` and nothing needs to.** Once the refresh lands, `value` *is* what was
  // chosen, so `chosen ?? value` and the staleness test both answer correctly with it still set. An
  // earlier draft cleared it in an effect, which the React Compiler lint rejects as a cascading
  // render — correctly: a value that becomes redundant is not a value that must be unset.
  const stale = !busy && chosen !== null && chosen !== value;

  async function choose(next: FontChoice) {
    setFailure(null);
    setChosen(next);
    setSaving(true);
    try {
      const result = await ledgerRequest("/api/v1/ui/font", fontPreferenceResponseSchema, {
        fallback: "That typeface could not be saved.",
        unreachable: "The app could not be reached, so the typeface was not changed."
      }, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ font: next })
      });
      if (!result.ok) {
        setFailure(result.why);
        setChosen(null);
        return;
      }
      // The layout re-reads the cookie and rewrites the attribute. Nothing here touches the DOM.
      // Started before `saving` clears, so `busy` stays true across the handover rather than
      // flickering false between the request and the refresh.
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  /**
   * **Only what just happened.** Standing copy is not in here any more — it is behind the `(i)`,
   * which is D-156's split applied to the one place it had not been: copy explaining a *principle*
   * folds, a message about the write the owner has just made does not.
   *
   * The reason it had to move is PLAN task 49 and it is a measurement rather than a preference.
   * `FONT_NOTES` is a sentence in a box capped by **width**, so the number of lines it occupies
   * depends on how wide the chosen face draws it — and that made the header the **only** thing on
   * either route whose height changed with the typeface. Measured on `/ledger`: `.header-side`
   * 71px in IBM Plex against **88px** in Press Start 2P, which pushed every landmark below it down
   * 16-17px and grew the document by the same. Nothing else moved anywhere.
   *
   * "Stored, but this view did not pick it up" is kept in full, because *nothing visible changed*
   * reads identically to a refusal and the two have opposite remedies (D-147).
   */
  const message = failure
    ?? (stale ? `${FONT_LABELS[chosen]} is saved. Reload to see it — this page could not refresh itself.` : null);

  return (
    <div className="font-picker">
      <label>
        <span>Typeface</span>
        <select
          value={chosen ?? value}
          disabled={busy}
          onChange={(event) => void choose(event.target.value as FontChoice)}
          aria-describedby="font-picker-note"
        >
          {FONT_CHOICES.map((choice) => (
            <option key={choice} value={choice}>{FONT_LABELS[choice]}</option>
          ))}
        </select>
      </label>
      {/* **A sibling of the `<label>`, never inside it**, and the first version of this was inside —
          the exact defect `app/ledger-note.tsx` documents and D-156 records having shipped once.
          A `<label>`'s accessible name is computed from its subtree, so the button's `sr-only` text
          joins it and the select announces as "Typeface About this typeface" — plus the whole note
          once the panel is open. **axe reports no violation for this**, because the name is
          non-empty and contains the visible text, so "the suites run axe on every route" is not
          evidence about it; only reading the computed name is. A `<button>` is also a *labelable*
          element, so a label containing both it and the select breaks the HTML content model.
          `.font-picker` is a grid, so the fragment's two children take their own rows here. */}
      <LedgerNote label="About this typeface">{FONT_NOTES[value]}</LedgerNote>
      {/* `aria-live` rather than `role="status"`: this shell already carries status regions, and a
          second computes to the same role and makes every unscoped `getByRole("status")` in the
          browser suite ambiguous (GOTCHAS).
          **Always rendered, empty when there is nothing to say**, so `aria-describedby` never
          points at an absent id and the live region is present before it has news — an
          `aria-live` element that appears at the same moment as its text is a region the screen
          reader was not watching. When empty it is **clipped, not `display: none`**: hiding it
          would remove it from the accessibility tree, which is the same failure in a different
          costume and would have made "always rendered" mean nothing. Clipping costs no height, so
          the header's standing box is still independent of whether there is a message. */}
      <p id="font-picker-note" className="field-help" aria-live="polite">{message}</p>
    </div>
  );
}
