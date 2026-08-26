"use client";

import { useId, useState } from "react";

/**
 * A short standing explanation, folded behind an `(i)`.
 *
 * **What belongs here and what does not.** Copy that explains a *principle* — how balances are
 * derived, why source facts are immutable, why cash is recorded on the ledger page — is worth
 * having and is not worth reading twice. It goes behind the button. A warning about the
 * irreversible thing the owner is *about to do* does not: it stays on the screen and sits next
 * to the control it is warning about. "It is written once and never edited" is guarding an
 * append-only write, not describing a philosophy, so it is not in one of these.
 *
 * **A button, not a tooltip.** Hover is not an input this app can assume — the owner reads the
 * ledger on a phone — and `title` is unreachable by keyboard and unreliable to screen readers.
 * `aria-expanded` on a real `<button>` says the same thing to everyone, which matters because
 * axe runs over every route in both suites.
 *
 * The panel is rendered only when open rather than hidden with CSS, so the collapsed copy is not
 * in the accessibility tree and cannot be read out as if it were on the page.
 *
 * **This returns a fragment, and it must never be rendered inside the heading it explains.**
 * Both facts are the same defect, caught by `/code-review` on the first version, which put the
 * whole thing in a `<span>` inside the `<h1>`/`<h2>`:
 *
 * 1. **A descendant's accessible name joins its ancestor's.** Every heading here is an
 *    `aria-labelledby` target for its `<section>`, so the button's own label — and the panel's
 *    text once open — became part of the name of both the heading *and* the landmark. Measured:
 *    the ledger region announced as `"Transactions About these transactions Everything committed
 *    to the ledger…"`. **axe reports no violation for this**, because the name is non-empty and
 *    contains the visible text; it is simply wrong, and only reading the computed name finds it.
 * 2. **`display: block` on a flex item is blockified away**, so a panel inside an `inline-flex`
 *    span could not drop onto its own line however the CSS was written, and the comment claiming
 *    it did was false.
 *
 * A fragment fixes both: the caller puts the button and the panel directly into a flex row that
 * is a *sibling* of the heading, where `flex-basis: 100%` gives the panel a line of its own and
 * nothing contributes to a name it does not belong to.
 */
export function LedgerNote({ label, children }: {
  /**
   * What this explains, for the button's accessible name — "About the ledger", not "More".
   * A page carrying three of these needs them told apart in a list of links and buttons.
   */
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <>
      <button
        type="button"
        className="note-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {/* The glyph is decorative and the name is the real one: a screen reader that read the
            letter would announce "i", which names nothing. */}
        <span aria-hidden="true">i</span>
        <span className="sr-only">{label}</span>
      </button>
      {open ? <p id={panelId} className="note-panel">{children}</p> : null}
    </>
  );
}
