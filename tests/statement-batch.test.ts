import { describe, expect, it } from "vitest";
import {
  describeStatement, planStatementBatch,
  type StatementBatchEntry
} from "@/lib/statement-batch";
import type { StatementFrame } from "@/lib/statement-frame";

/**
 * Bulk statement import's policy.
 *
 * Every value here is invented, per `docs/FIXTURE_POLICY.md`. The periods are round calendar
 * months chosen to make intersections obvious to a reader, the suffixes are sequential, and the
 * digests are fixed strings of the right shape rather than hashes of anything.
 *
 * There is no browser, no pdf.js and no worker in these tests, because there is none in the
 * module. That is the point of the split: the rules deciding **what order a batch is worked in**
 * and **what a batch can see that a single import cannot** must not need a PDF to exercise.
 */

function frame(overrides: Partial<StatementFrame> = {}): StatementFrame {
  return {
    bankCode: "SCB",
    contractVersion: "scb-layout-v1",
    accountType: null,
    accountLastFour: "1111",
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    openingBalance: "100000",
    closingBalance: "120000",
    currency: "THB",
    balancesPrinted: true,
    crossChecked: true,
    ...overrides
  };
}

function readable(id: string, overrides: Partial<StatementFrame> = {}, digest = id.repeat(8)): StatementBatchEntry {
  return {
    id,
    label: `${id}.pdf`,
    artifactDigest: digest,
    read: { ok: true, frame: frame(overrides), rowCount: 40, pageCount: 3 }
  };
}

describe("planStatementBatch", () => {
  it("orders an account's statements oldest first, and keeps accounts together", () => {
    // Deliberately chosen out of order and interleaved between two accounts, which is what a
    // folder of saved attachments actually looks like.
    const plan = planStatementBatch([
      readable("c", { accountLastFour: "2222", periodStart: "2026-04-01", periodEnd: "2026-04-30" }),
      readable("a", { accountLastFour: "1111", periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
      readable("d", { accountLastFour: "2222", periodStart: "2026-03-01", periodEnd: "2026-03-31" }),
      readable("b", { accountLastFour: "1111", periodStart: "2026-04-01", periodEnd: "2026-04-30" })
    ]);

    expect(plan.blocked).toEqual([]);
    expect(plan.ready.map((item) => item.entry.id)).toEqual(["b", "a", "d", "c"]);
  });

  it("sorts by bank before suffix, so one bank's accounts are not split by another's", () => {
    const plan = planStatementBatch([
      readable("scb", { bankCode: "SCB", contractVersion: "scb-layout-v1", accountLastFour: "5555" }),
      readable("ktb", { bankCode: "KTB", contractVersion: "krungthai-layout-v1", accountLastFour: "9999" }),
      readable("kbank", { bankCode: "KBANK", contractVersion: "kbank-layout-v1", accountLastFour: "1111" })
    ]);

    expect(plan.ready.map((item) => item.entry.id)).toEqual(["kbank", "ktb", "scb"]);
  });

  it("keeps a stable order when two statements agree on bank, suffix and period", () => {
    // Without the chosen-order tiebreak this reshuffles between renders, which makes a worklist
    // the owner is working down move under him.
    const first = planStatementBatch([readable("x"), readable("y")]);
    const second = planStatementBatch([readable("x"), readable("y")]);

    expect(first.ready.map((item) => item.entry.id)).toEqual(["x", "y"]);
    expect(second.ready.map((item) => item.entry.id)).toEqual(["x", "y"]);
  });

  it("carries the reader's own sentence for a statement that would not read", () => {
    const plan = planStatementBatch([
      { id: "bad", label: "bad.pdf", artifactDigest: "f".repeat(64), read: { ok: false, reason: "This PDF does not match any supported bank statement layout." } }
    ]);

    expect(plan.ready).toEqual([]);
    expect(plan.blocked).toHaveLength(1);
    expect(plan.blocked[0]!.reason).toBe("unreadable");
    // Verbatim, not reworded: the message names which reader declined and is what a diagnostic
    // run is read from.
    expect(plan.blocked[0]!.message).toBe("This PDF does not match any supported bank statement layout.");
  });

  it("blocks a statement whose printed totals never confirmed its rows, before any account is chosen", () => {
    // The same refusal `assembleImportPayload` gives (D-043), said early because it is a property
    // of the document: no account would make it importable.
    const plan = planStatementBatch([readable("uncrosschecked", { crossChecked: false })]);

    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0]!.reason).toBe("not-cross-checked");
    expect(plan.blocked[0]!.message).toContain("will not be imported");
  });

  it("blocks the same file picked twice and names the entry it repeats", () => {
    const digest = "a".repeat(64);
    const plan = planStatementBatch([
      readable("first", {}, digest),
      readable("second", {}, digest)
    ]);

    expect(plan.ready.map((item) => item.entry.id)).toEqual(["first"]);
    expect(plan.blocked).toHaveLength(1);
    expect(plan.blocked[0]!.reason).toBe("duplicate-file");
    expect(plan.blocked[0]!.duplicateOf).toBe("first");
  });

  it("treats a repeated file as one problem even when it does not read", () => {
    const digest = "b".repeat(64);
    const unreadable = { label: "x.pdf", artifactDigest: digest, read: { ok: false as const, reason: "Unsupported." } };
    const plan = planStatementBatch([
      { id: "first", ...unreadable },
      { id: "second", ...unreadable }
    ]);

    expect(plan.blocked.map((item) => item.reason)).toEqual(["unreadable", "duplicate-file"]);
  });

  it("warns that two statements for one account cover intersecting periods, without refusing either", () => {
    // The exact guard is the row fingerprint's unique index; this only predicts the collision.
    // Both stay confirmable, and both say so about the other.
    const plan = planStatementBatch([
      readable("march", { periodStart: "2026-03-01", periodEnd: "2026-03-31" }),
      readable("mid", { periodStart: "2026-03-15", periodEnd: "2026-04-15" })
    ]);

    expect(plan.blocked).toEqual([]);
    expect(plan.ready).toHaveLength(2);
    expect(plan.ready[0]!.overlaps).toEqual(["mid"]);
    expect(plan.ready[1]!.overlaps).toEqual(["march"]);
  });

  it("counts a shared boundary day as an intersection", () => {
    // A statement ending on the 31st and the next starting on the 31st share that day's rows,
    // which is exactly the case the fingerprint index refuses.
    const plan = planStatementBatch([
      readable("earlier", { periodStart: "2026-03-01", periodEnd: "2026-03-31" }),
      readable("later", { periodStart: "2026-03-31", periodEnd: "2026-04-30" })
    ]);

    expect(plan.ready[0]!.overlaps).toEqual(["later"]);
  });

  it("does not call adjacent periods an overlap", () => {
    const plan = planStatementBatch([
      readable("march", { periodStart: "2026-03-01", periodEnd: "2026-03-31" }),
      readable("april", { periodStart: "2026-04-01", periodEnd: "2026-04-30" })
    ]);

    expect(plan.ready.every((item) => item.overlaps.length === 0)).toBe(true);
  });

  it("does not call intersecting periods on different accounts an overlap", () => {
    // Two accounts at one bank routinely hold the same calendar month, and they share no rows.
    const plan = planStatementBatch([
      readable("one", { accountLastFour: "1111" }),
      readable("two", { accountLastFour: "2222" })
    ]);

    expect(plan.ready.every((item) => item.overlaps.length === 0)).toBe(true);
  });

  it("does not call the same suffix at two banks an overlap", () => {
    // `public.accounts` is unique on (owner, bank_code, last_four), so one owner can hold the
    // same four digits at three banks.
    const plan = planStatementBatch([
      readable("scb", { bankCode: "SCB", contractVersion: "scb-layout-v1" }),
      readable("ktb", { bankCode: "KTB", contractVersion: "krungthai-layout-v1" })
    ]);

    expect(plan.ready.every((item) => item.overlaps.length === 0)).toBe(true);
  });

  it("returns an empty plan for an empty batch", () => {
    expect(planStatementBatch([])).toEqual({ ready: [], blocked: [] });
  });
});

describe("describeStatement", () => {
  it("summarises what the statement says it is, and carries no value from inside it", () => {
    const plan = planStatementBatch([readable("one")]);
    const summary = describeStatement(plan.ready[0]!);

    expect(summary).toBe("SCB •••• 1111, 2026-03-01 to 2026-03-31, 40 row(s) across 3 page(s)");
    // The frame carries balances, and a worklist row is not where they belong: the review table
    // shows them one statement at a time, after binding.
    expect(summary).not.toContain("100000");
    expect(summary).not.toContain("120000");
  });
});
