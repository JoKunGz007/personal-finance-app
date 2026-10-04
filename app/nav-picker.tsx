"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LedgerNote } from "@/app/ledger-note";
import { ledgerRequest } from "@/lib/wire";
import {
  NAV_CHOICES,
  NAV_LABELS,
  NAV_NOTES,
  navPreferenceResponseSchema,
  type NavChoice
} from "@/lib/ui-nav";

/**
 * Chooses how the section nav is laid out at phone width (2026-10-04).
 *
 * A deliberate copy of `app/theme-picker.tsx`, state machine included: the server owns the answer, the
 * route writes an httpOnly cookie and replies with what it stored, `router.refresh()` re-runs the
 * layout, and the layout rewrites `data-nav` on `<html>`. Nothing here touches the DOM.
 */
export function NavPicker({ value }: { value: NavChoice }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [chosen, setChosen] = useState<NavChoice | null>(null);
  const [saving, setSaving] = useState(false);

  const busy = saving || pending;
  const stale = !busy && chosen !== null && chosen !== value;

  async function choose(next: NavChoice) {
    setFailure(null);
    setChosen(next);
    setSaving(true);
    try {
      const result = await ledgerRequest("/api/v1/ui/nav", navPreferenceResponseSchema, {
        fallback: "That nav layout could not be saved.",
        unreachable: "The app could not be reached, so the nav layout was not changed."
      }, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nav: next })
      });
      if (!result.ok) {
        setFailure(result.why);
        setChosen(null);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  const message = failure
    ?? (stale ? `${NAV_LABELS[chosen]} is saved. Reload to see it — this page could not refresh itself.` : null);

  return (
    <div className="ui-picker nav-picker">
      <label>
        <span>Phone nav</span>
        <select
          value={chosen ?? value}
          disabled={busy}
          onChange={(event) => void choose(event.target.value as NavChoice)}
          aria-describedby="nav-picker-note"
        >
          {NAV_CHOICES.map((choice) => (
            <option key={choice} value={choice}>{NAV_LABELS[choice]}</option>
          ))}
        </select>
      </label>
      {/* A sibling of the `<label>`, never inside it (see `app/theme-picker.tsx`). */}
      <LedgerNote label="About the phone nav">{NAV_NOTES[value]}</LedgerNote>
      <p id="nav-picker-note" className="field-help" aria-live="polite">{message}</p>
    </div>
  );
}
