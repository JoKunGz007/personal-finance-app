import type { StatementFrame } from "@/lib/statement-frame";

/**
 * Bulk statement import's policy layer: many statements in, one verdict each, no pixels and
 * no network.
 *
 * The separation is the one `lib/slip-batch.ts` already makes and for the same reason — the
 * interesting decisions here are about *what a batch can see that a single import cannot*, and a
 * decision that can only be exercised through a browser is a decision nothing tests. The component
 * supplies the unlocking and the parsing; everything below is arithmetic and rules over the frames
 * those parses produced.
 *
 * ## What this layer deliberately does not do
 *
 * **It never proposes a ledger account.** Binding is a checked user decision and not a parser
 * inference (D-017), and `assembleImportPayload` re-checks the choice against the printed bank,
 * suffix and currency. A batch makes that rule *more* tempting to break, not less — a statement
 * prints a bank code and four digits, `public.accounts` is unique on
 * `(owner_id, bank_code, last_four)`, and so a lookup would resolve unambiguously every time. It is
 * still the ledger's routing decision, and it is still the owner's. Nothing here takes a list of
 * accounts as input, which is the structural version of that promise.
 *
 * **It never decides that a statement may be imported.** `assembleImportPayload` does, on the
 * owner's binding, exactly as it does for a single import. What this produces is a worklist and an
 * order to work it in.
 */

export type BatchEntryId = string;

/** What one file's parse produced, narrowed to what a batch decision needs. */
export type StatementRead =
  | { readonly ok: true; readonly frame: StatementFrame; readonly rowCount: number; readonly pageCount: number }
  /** The reader's own sentence, carried verbatim so the worklist says why in its words, not ours. */
  | { readonly ok: false; readonly reason: string };

export type StatementBatchEntry = {
  readonly id: BatchEntryId;
  /**
   * For display beside the row, so the owner can tell one entry from another. It is the file's
   * own name and it stays on the device: no payload field carries it, and nothing here writes it
   * anywhere. A statement's file name routinely carries an account number or a holder's name,
   * which is why `scripts/mask-statement.mjs` masks it the moment a *dump* is written — a name
   * shown back to the owner on his own screen is the case that rule was never about.
   */
  readonly label: string;
  /** The PDF's SHA-256, already computed by the caller to identify the artifact. */
  readonly artifactDigest: string;
  readonly read: StatementRead;
};

export type BlockedReason =
  /** No reader matched, or a reader refused. Carries that reader's message. */
  | "unreadable"
  /** Read, but the bank's own arithmetic never confirmed the rows, so it may not be imported. */
  | "not-cross-checked"
  /** Byte-identical to an earlier entry in the same batch — the same file picked twice. */
  | "duplicate-file";

export type BlockedEntry = {
  readonly entry: StatementBatchEntry;
  readonly reason: BlockedReason;
  readonly message: string;
  /** Set for `duplicate-file`: the earlier entry this one repeats. */
  readonly duplicateOf?: BatchEntryId;
};

export type ReadyEntry = {
  readonly entry: StatementBatchEntry;
  readonly frame: StatementFrame;
  readonly rowCount: number;
  readonly pageCount: number;
  /**
   * Other ready entries in this batch printing an intersecting period for the same account.
   *
   * **A warning and never a refusal.** The exact guard is `unique (owner_id, account_id,
   * fingerprint)` in the database, which refuses the individual rows two statements share and
   * nothing else; an overlap of periods only *predicts* that collision, and two statements can
   * legitimately overlap while sharing no row. Blocking on a prediction would refuse valid work.
   * What it buys is that the collision is visible here, before anything is sent — where it would
   * otherwise surface at confirm as a unique violation the route flattens into a generic
   * "could not be confirmed atomically", which reads the same as a real database fault.
   */
  readonly overlaps: readonly BatchEntryId[];
};

export type StatementBatchPlan = {
  /** In the order to confirm them. */
  readonly ready: readonly ReadyEntry[];
  /** In the order they were chosen, which is the order the owner will look for them in. */
  readonly blocked: readonly BlockedEntry[];
};

const NOT_CROSS_CHECKED =
  "This statement printed no summary block the reader could match, so its rows were never checked " +
  "against the bank's own counts and totals. It will not be imported.";

/** `YYYY-MM-DD` compares correctly as text, so no date parsing is needed to intersect two periods. */
function periodsIntersect(a: StatementFrame, b: StatementFrame): boolean {
  return a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd;
}

function sameAccount(a: StatementFrame, b: StatementFrame): boolean {
  return a.bankCode === b.bankCode && a.accountLastFour === b.accountLastFour;
}

/**
 * One batch's worklist: what can be worked, in what order, and what cannot be and why.
 *
 * **The order is oldest-first within an account, and that is not cosmetic.** The ledger is
 * append-only and a statement's rows are reconciled forward from its opening balance, so working
 * an account's statements newest-first means reading balance chains that appear to contradict each
 * other. Grouping by account keeps one account's periods adjacent, which is what makes an
 * intersecting period obvious to a person rather than only to the code below.
 *
 * Entries that cannot be worked keep their chosen order instead, because that is the order the
 * owner will scan looking for the file he expected to see.
 */
export function planStatementBatch(entries: readonly StatementBatchEntry[]): StatementBatchPlan {
  const blocked: BlockedEntry[] = [];
  const readable: Array<{ entry: StatementBatchEntry; frame: StatementFrame; rowCount: number; pageCount: number }> = [];
  const digestsSeen = new Map<string, BatchEntryId>();

  for (const entry of entries) {
    // Checked before the parse verdict: two picks of the same file are the same file whether or
    // not it reads, and reporting it as unreadable twice would send the owner looking for two
    // problems where there is one.
    const earlier = digestsSeen.get(entry.artifactDigest);
    if (earlier !== undefined) {
      blocked.push({
        entry,
        reason: "duplicate-file",
        duplicateOf: earlier,
        message: "This is the same file as an earlier one in this batch, so it is left out."
      });
      continue;
    }
    digestsSeen.set(entry.artifactDigest, entry.id);

    if (!entry.read.ok) {
      blocked.push({ entry, reason: "unreadable", message: entry.read.reason });
      continue;
    }

    // Said here rather than discovered at binding. `assembleImportPayload` refuses this first and
    // for the same reason (D-043) — it is a property of the document, so no account will do — and
    // in a batch that refusal is worth showing before the owner works down a list choosing
    // accounts for statements that cannot take one.
    if (!entry.read.frame.crossChecked) {
      blocked.push({ entry, reason: "not-cross-checked", message: NOT_CROSS_CHECKED });
      continue;
    }

    readable.push({
      entry,
      frame: entry.read.frame,
      rowCount: entry.read.rowCount,
      pageCount: entry.read.pageCount
    });
  }

  const ordered = [...readable].sort((a, b) =>
    a.frame.bankCode.localeCompare(b.frame.bankCode)
    || a.frame.accountLastFour.localeCompare(b.frame.accountLastFour)
    || a.frame.periodStart.localeCompare(b.frame.periodStart)
    || a.frame.periodEnd.localeCompare(b.frame.periodEnd)
    // Two statements identical in all four still need a stable order, or the worklist reshuffles
    // itself between renders. The chosen order is the tiebreak because it is the only one the
    // owner has any expectation about.
    || entries.indexOf(a.entry) - entries.indexOf(b.entry)
  );

  const ready: ReadyEntry[] = ordered.map((item) => ({
    entry: item.entry,
    frame: item.frame,
    rowCount: item.rowCount,
    pageCount: item.pageCount,
    overlaps: ordered
      .filter((other) => other.entry.id !== item.entry.id
        && sameAccount(other.frame, item.frame)
        && periodsIntersect(other.frame, item.frame))
      .map((other) => other.entry.id)
  }));

  return { ready, blocked };
}

/**
 * A one-line summary of what a statement says it is, for the worklist row.
 *
 * **Every field in it was printed on the statement and none of it is a value.** The bank, the
 * suffix, the period and the counts describe the document; the amounts, balances and dates that
 * make up its contents are what the review table is for, one statement at a time, after binding.
 */
export function describeStatement(ready: ReadyEntry): string {
  return `${ready.frame.bankCode} •••• ${ready.frame.accountLastFour}, `
    + `${ready.frame.periodStart} to ${ready.frame.periodEnd}, `
    + `${ready.rowCount} row(s) across ${ready.pageCount} page(s)`;
}
