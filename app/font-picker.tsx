"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

  const note = failure
    // Stored, but this view did not pick it up. Say which of the two happened, because "nothing
    // visible changed" reads identically to a refusal and the remedies are opposite.
    ?? (stale ? `${FONT_LABELS[chosen]} is saved. Reload to see it — this page could not refresh itself.` : null)
    ?? FONT_NOTES[value];

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
      {/* `aria-live` rather than `role="status"`: this shell already carries status regions, and a
          second computes to the same role and makes every unscoped `getByRole("status")` in the
          browser suite ambiguous (GOTCHAS). */}
      <p id="font-picker-note" className="field-help" aria-live="polite">{note}</p>
    </div>
  );
}
