/**
 * What the owner is working off the statement worklist, and where it has got to.
 *
 * ## Why this is one value
 *
 * **It was three `useState` slots, and the seam between them is where two defects lived.**
 * `app/import-bench.tsx` carried `workingLabel`, `batchBinding` and `batchConfirmation`, each set
 * independently, and clearing the mode meant remembering all three. It was got wrong twice inside
 * three days:
 *
 * - `workingLabel` was only ever *set* (D-147). Confirming a single import after working a worklist
 *   entry still found it non-null, so the banner announced that the **earlier** statement had
 *   reached the ledger, carrying this one's row count, account and batch id.
 * - The helper written to fix that, `leaveTheWorklist()`, was then called at **two of four** exits
 *   (D-148). A stale binding banner survived onto an unrelated PDF, above a live Confirm button
 *   still holding the previous statement's payload.
 *
 * The `GOTCHAS.md` trap those produced asks *what puts this back?* — and notes that a helper is not
 * the answer, because a helper is still a thing to remember. **One value is the answer**: the mode
 * is `null` or it is a `Worklist`, so it cannot be cleared by halves and there is no combination of
 * three setters to get wrong. That is the whole reason this type exists.
 *
 * ## Why it is here rather than in the component
 *
 * Every transition below is a pure function of the current value and one event, so all of it is
 * testable without a browser — which matters because **no committed spec drives the batch worklist**
 * and none can while these decisions live inside a React component (`PLAN.md`). The component keeps
 * its markup and reads one value.
 *
 * This is deliberately **not** the whole stage machine. `stage`, the parsed statement and the bound
 * account still live in the component, because moving them is a much larger change to a path that
 * files money into an append-only ledger, and the defects were never there.
 */

/** What binding a statement to an account resolved to. */
export type BindOutcome =
  | { readonly kind: "bound"; readonly accountLabel: string }
  | { readonly kind: "needs-account" }
  | { readonly kind: "refused"; readonly message: string };

/**
 * Where a worklist entry has got to.
 *
 * **`bound` and `refused` are separate members rather than two nullable fields**, which is the
 * second thing this type is for. They were `boundTo: string | null` and `refusal: string | null`
 * with a prose invariant saying they are never both set — an invariant a reader had to be told,
 * which is an invariant the type should have been enforcing, and which two nested ternaries in the
 * markup silently depended on.
 */
export type WorklistPhase =
  | BindOutcome
  | { readonly kind: "confirmed"; readonly accountLabel: string; readonly batchId: string };

export type Worklist = {
  readonly label: string;
  readonly rows: number;
  readonly phase: WorklistPhase;
};

/** Taking a statement off the worklist. The outcome is whatever binding it produced. */
export function openedFromWorklist(label: string, rows: number, phase: BindOutcome): Worklist {
  return { label, rows, phase };
}

/**
 * The owner chose an account by hand and pressed Bind.
 *
 * **Returns `null` unchanged when nothing is being worked**, because the single-import path shares
 * this button and has its own status line and no worklist to answer to. Expressing that as "null in,
 * null out" is what stops the caller having to ask.
 */
export function rebound(current: Worklist | null, phase: BindOutcome): Worklist | null {
  return current === null ? null : { ...current, phase };
}

/** The statement reached the ledger. */
export function confirmed(
  current: Worklist | null,
  accountLabel: string,
  batchId: string
): Worklist | null {
  return current === null ? null : { ...current, phase: { kind: "confirmed", accountLabel, batchId } };
}

/**
 * What to say, and in which of the three established `.capture-result` tones.
 *
 * **A total function over the phase**, which is what replaced a pair of nested ternaries reading two
 * nullable strings. Adding a phase is now a type error here rather than a banner that silently falls
 * through to the wrong branch.
 *
 * `confirmed` returns `null`: the worklist renders its own confirmation banner, and showing this one
 * too would answer the same press twice, in two places, one of them stale.
 */
export function bannerFor(worklist: Worklist): {
  readonly tone: "captured" | "already" | "failed";
  readonly heading: string;
  readonly body: string;
} | null {
  const { label, rows, phase } = worklist;
  switch (phase.kind) {
    case "bound":
      return {
        tone: "captured",
        heading: `${label} is bound to ${phase.accountLabel}.`,
        body: `${rows} row(s) read on this device and nothing has left it yet. Review every balance`
          + " below, then confirm — the import is not in the ledger until you do."
      };
    case "needs-account":
      return {
        tone: "already",
        heading: `${label} is read and needs an account.`,
        body: `${rows} row(s) read on this device. Choose the ledger account it belongs to below.`
      };
    case "refused":
      return {
        tone: "failed",
        heading: `${label} could not be bound.`,
        body: `${phase.message} Nothing has been sent. Choose the account below, or leave this`
          + " statement and work the next one."
      };
    case "confirmed":
      return null;
  }
}

/**
 * The confirmation the worklist shows, or `null` when there is not one.
 *
 * Derived rather than stored: it used to be a third `useState` that had to be set on confirming and
 * cleared on everything else, which is exactly the shape that produced D-147.
 */
export function confirmationFor(worklist: Worklist | null): {
  readonly label: string;
  readonly rows: number;
  readonly accountLabel: string;
  readonly batchId: string;
} | null {
  if (worklist === null || worklist.phase.kind !== "confirmed") return null;
  return {
    label: worklist.label,
    rows: worklist.rows,
    accountLabel: worklist.phase.accountLabel,
    batchId: worklist.phase.batchId
  };
}

/**
 * Whether the refusal shown in the binding section would repeat what the banner already says.
 *
 * **Compared by provenance, not by string equality.** The suppression was written as
 * `bindingError !== batchBinding?.refusal`, which held only while no other path could produce the
 * same sentence and would have broken silently the day two wordings converged — the alert would
 * simply vanish. The question is *where the message came from*, and that is a phase.
 */
export function bannerCarriesRefusal(worklist: Worklist | null): boolean {
  return worklist?.phase.kind === "refused";
}
