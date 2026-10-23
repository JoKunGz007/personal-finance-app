import { describe, expect, it } from "vitest";
import type { LedgerAccount } from "@/lib/accounts";
import { reconcileLedger } from "@/lib/slip-reconcile";
import { duplicateListSchema, markDuplicateBodySchema, withoutDuplicates, type AccountTransaction } from "@/lib/transactions";

// Marked duplicates are hidden from the table only (migration 062, PLAN task 59). Invented values.
// What hiding does to totals, balance and counts is tested through `deriveLedgerView` in
// `tests/ledger-view.test.ts`; this file keeps the filter's own unit test and the wire shapes.

const ACCOUNT: LedgerAccount = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  bank_code: "KTB", label: "Invented KTB", account_type: "savings",
  last_four: "4242", currency: "THB", timezone: "Asia/Bangkok"
};

function row(n: number, amount: string, excluded: boolean, balance: string): AccountTransaction {
  return {
    id: `bbbbbbbb-0000-4000-8000-00000000000${n}`,
    source_date: "2026-06-10",
    source_time: `09:3${n}:00`,
    effective_date: "2026-06-10",
    transaction_label: "Invented label",
    description: "Invented description",
    reference: null,
    branch: null,
    post_balance_minor: balance,
    currency: "THB",
    source_components: [{ id: `cccccccc-0000-4000-8000-00000000000${n}`, kind: "withdrawal", amount_minor: amount, currency: "THB" }],
    transaction_overlays: excluded ? [{
      category_id: null, description: null, counterparty: null, effective_date: null, note: null,
      include_in_reporting: false, revision: 2, updated_at: "2026-06-11T03:00:00Z"
    }] : [],
    category_source: null,
    category_source_revision: null,
    category_reviewed: false,
    category_parent_name: null,
    account_id: ACCOUNT.id
  };
}

const ROWS = [row(1, "-9000", false, "491000"), row(2, "-9000", true, "500000"), row(3, "-1500", false, "489500")];
const DUPLICATES: ReadonlySet<string> = new Set([ROWS[1]!.id]);
const { rows } = reconcileLedger(ROWS, [], [ACCOUNT]);

describe("hiding marked duplicates", () => {
  it("removes only the marked confirmed row, and only when hidden", () => {
    expect(withoutDuplicates(rows, DUPLICATES, false).map((r) => r.id)).toHaveLength(2);
    expect(withoutDuplicates(rows, DUPLICATES, false).some((r) => r.kind === "confirmed" && r.transaction.id === ROWS[1]!.id)).toBe(false);
    expect(withoutDuplicates(rows, DUPLICATES, true)).toBe(rows);
    expect(withoutDuplicates(rows, new Set(), false)).toBe(rows);
  });

  it("validates the wire shapes", () => {
    expect(duplicateListSchema.safeParse({ ids: [ROWS[0]!.id] }).success).toBe(true);
    expect(duplicateListSchema.safeParse({ ids: ["x"] }).success).toBe(false);
    expect(markDuplicateBodySchema.safeParse({ expectedRevision: 0 }).success).toBe(true);
    expect(markDuplicateBodySchema.safeParse({ expectedRevision: -1 }).success).toBe(false);
    expect(markDuplicateBodySchema.safeParse({ expectedRevision: 1, note: "x" }).success).toBe(false);
  });
});
