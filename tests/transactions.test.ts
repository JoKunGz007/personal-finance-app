import { describe, expect, it } from "vitest";
import {
  compareTransactions,
  matchesQuery,
  movementMinor,
  summarize,
  transactionListSchema,
  type LedgerTransaction
} from "@/lib/transactions";

const FINGERPRINT = "a".repeat(64);

function transaction(overrides: Partial<LedgerTransaction> = {}): LedgerTransaction {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    source_date: "2026-06-01",
    source_time: "09:30:00",
    effective_date: "2026-06-01",
    transaction_label: "Invented label",
    description: "Invented description",
    reference: null,
    branch: null,
    post_balance_minor: "100000",
    currency: "THB",
    fingerprint: FINGERPRINT,
    source_components: [{ id: "22222222-2222-4222-8222-222222222222", kind: "deposit", amount_minor: "100000", currency: "THB" }],
    import_batch_rows: [],
    transaction_overlays: [],
    ...overrides
  };
}

describe("transaction wire contract", () => {
  it("accepts the shape list_account_transactions returns", () => {
    const parsed = transactionListSchema.safeParse({ transactions: [transaction()] });
    expect(parsed.success).toBe(true);
  });

  // The RPC casts every bigint with ::text precisely so money never becomes a JSON
  // number. A schema that accepted a decimal or a float would silently undo that.
  it.each(["1000.50", "1e5", "+1000", "-0", "01"])("rejects non-canonical money %s", (value) => {
    const parsed = transactionListSchema.safeParse({
      transactions: [transaction({ post_balance_minor: value })]
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown column rather than ignoring it", () => {
    const parsed = transactionListSchema.safeParse({
      transactions: [{ ...transaction(), settled_at: "2026-06-01" }]
    });
    expect(parsed.success).toBe(false);
  });
});

describe("movement and totals stay exact", () => {
  it("sums components without floating point", () => {
    const row = transaction({
      source_components: [
        { id: "33333333-3333-4333-8333-333333333333", kind: "deposit", amount_minor: "12345", currency: "THB" },
        { id: "44444444-4444-4444-8444-444444444444", kind: "withdrawal", amount_minor: "-45", currency: "THB" }
      ]
    });
    expect(movementMinor(row)).toBe("12300");
  });

  // Beyond 2^53 a double loses integer precision. Not reachable at this scale, but
  // the read path must not be where that first stops being true.
  it("keeps precision past the safe-integer boundary", () => {
    const big = "9007199254740993";
    const row = transaction({
      source_components: [{ id: "55555555-5555-4555-8555-555555555555", kind: "deposit", amount_minor: big, currency: "THB" }]
    });
    expect(movementMinor(row)).toBe(big);
    // And the loss is real rather than hypothetical: routing the same value through a
    // double lands on ...992. Asserting against a numeric literal would not show this,
    // because the literal is unrepresentable too and collapses to the same wrong value.
    expect(String(Number(big))).toBe("9007199254740992");
  });

  it("splits deposits from withdrawals and nets them", () => {
    const totals = summarize([
      transaction({ source_components: [{ id: "66666666-6666-4666-8666-666666666666", kind: "deposit", amount_minor: "5000", currency: "THB" }] }),
      transaction({ source_components: [{ id: "77777777-7777-4777-8777-777777777777", kind: "withdrawal", amount_minor: "-1200", currency: "THB" }] })
    ]);
    expect(totals).toEqual({ rows: 2, deposits: "5000", withdrawals: "-1200", net: "3800" });
  });

  it("reports zero on an empty ledger rather than failing", () => {
    expect(summarize([])).toEqual({ rows: 0, deposits: "0", withdrawals: "0", net: "0" });
  });
});

describe("merged ordering mirrors the RPC", () => {
  it("sorts newest date first", () => {
    const older = transaction({ source_date: "2026-06-01" });
    const newer = transaction({ source_date: "2026-06-02" });
    expect([older, newer].sort(compareTransactions)[0]).toBe(newer);
  });

  it("sorts a later time first within one date", () => {
    const early = transaction({ source_time: "08:00:00" });
    const late = transaction({ source_time: "17:00:00" });
    expect([early, late].sort(compareTransactions)[0]).toBe(late);
  });

  // PostgreSQL puts nulls FIRST under `desc`, so the RPC says `nulls last`
  // explicitly. A comparator that forgot it would float untimed rows to the top.
  it("puts an untimed row last within its date", () => {
    const timed = transaction({ source_time: "08:00:00" });
    const untimed = transaction({ source_time: null });
    expect([untimed, timed].sort(compareTransactions)).toEqual([timed, untimed]);
  });

  it("breaks a full tie on id, so the order is total", () => {
    const a = transaction({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const b = transaction({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    expect([b, a].sort(compareTransactions)).toEqual([a, b]);
  });
});

describe("client-side filtering", () => {
  it("matches everything on an empty or blank query", () => {
    expect(matchesQuery(transaction(), "")).toBe(true);
    expect(matchesQuery(transaction(), "   ")).toBe(true);
  });

  it("searches source fields case-insensitively", () => {
    expect(matchesQuery(transaction({ description: "Coffee shop" }), "COFFEE")).toBe(true);
    expect(matchesQuery(transaction({ reference: "REF-9931" }), "9931")).toBe(true);
    expect(matchesQuery(transaction({ branch: "Silom" }), "silom")).toBe(true);
  });

  it("searches overlay text, which is what the owner actually wrote", () => {
    const row = transaction({
      transaction_overlays: [{
        category_id: null, description: "Rent", counterparty: "Landlord",
        effective_date: null, note: null, include_in_reporting: true,
        revision: 1, updated_at: "2026-06-02T00:00:00Z"
      }]
    });
    expect(matchesQuery(row, "rent")).toBe(true);
    expect(matchesQuery(row, "landlord")).toBe(true);
  });

  // A fingerprint is a server-verified identity, not something a person searches by,
  // and matching it would let a filter surface rows by an internal value.
  it("does not match on the fingerprint or the id", () => {
    expect(matchesQuery(transaction(), FINGERPRINT)).toBe(false);
    expect(matchesQuery(transaction(), "11111111-1111-4111-8111-111111111111")).toBe(false);
  });
});
