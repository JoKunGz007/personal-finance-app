import { describe, expect, it } from "vitest";
import {
  combinedBalanceByTransaction,
  compareTransactions,
  matchesQuery,
  matchesSlipQuery,
  movementMinor,
  summarize,
  transactionListSchema,
  type AccountTransaction,
  type LedgerTransaction
} from "@/lib/transactions";
import { slipListSchema, type CapturedSlip } from "@/lib/slips";

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

describe("combined balance across accounts", () => {
  const A = "aaaaaaaa-0000-4000-8000-000000000001";
  const B = "bbbbbbbb-0000-4000-8000-000000000002";

  function row(id: string, accountId: string, date: string, post: string, movement: string): AccountTransaction {
    const kind = BigInt(movement) > 0n ? "deposit" as const : "withdrawal" as const;
    return {
      ...transaction({ id, source_date: date, post_balance_minor: post }),
      account_id: accountId,
      source_components: [{ id: `${id.slice(0, 8)}-1111-4111-8111-111111111111`, kind, amount_minor: movement, currency: "THB" }]
    };
  }

  // Account B's first imported row is dated after A's first, so at A's first row B has
  // no row yet — but its balance then is derivable as 5000 - 500 = 4500. A total that
  // ignored it would understate every early row.
  const ledger = [
    row("11111111-0000-4000-8000-000000000001", A, "2026-06-01", "1000", "1000"),
    row("22222222-0000-4000-8000-000000000002", B, "2026-06-02", "5000", "500"),
    row("33333333-0000-4000-8000-000000000003", A, "2026-06-03", "800", "-200")
  ];

  it("includes an account's derived balance from before its first imported row", () => {
    const combined = combinedBalanceByTransaction(ledger);
    expect(combined.get("11111111-0000-4000-8000-000000000001")).toBe("5500");
  });

  it("tracks each account's latest balance as the merged list advances", () => {
    const combined = combinedBalanceByTransaction(ledger);
    expect(combined.get("22222222-0000-4000-8000-000000000002")).toBe("6000");
    expect(combined.get("33333333-0000-4000-8000-000000000003")).toBe("5800");
  });

  it("ends on the sum of every account's latest printed balance", () => {
    const combined = combinedBalanceByTransaction(ledger);
    expect(combined.get("33333333-0000-4000-8000-000000000003")).toBe((800n + 5000n).toString());
  });

  it("is independent of the order it is handed the rows", () => {
    const shuffled = [ledger[2]!, ledger[0]!, ledger[1]!];
    expect(combinedBalanceByTransaction(shuffled)).toEqual(combinedBalanceByTransaction(ledger));
  });

  it("covers every row, so the map is total", () => {
    const combined = combinedBalanceByTransaction(ledger);
    expect([...combined.keys()].sort()).toEqual(ledger.map((r) => r.id).sort());
  });

  it("handles a single account by returning its own printed balances", () => {
    const combined = combinedBalanceByTransaction([ledger[0]!, ledger[2]!]);
    expect(combined.get("33333333-0000-4000-8000-000000000003")).toBe("800");
  });

  it("returns an empty map for an empty ledger rather than failing", () => {
    expect(combinedBalanceByTransaction([]).size).toBe(0);
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

// The slip half of the ledger view's wire and filter contracts. Matching itself lives in
// `tests/slip-reconcile.test.ts`, with the module that owns it.
describe("captured slips in the ledger view", () => {
  const slip = (overrides: Partial<CapturedSlip> = {}): CapturedSlip => ({
    id: "33333333-3333-4333-8333-333333333333",
    bank_code: "SCB",
    slip_reference: "INVENTEDREFERENCE01",
    kind: "withdrawal",
    amount_minor: "-25000",
    currency: "THB",
    occurred_on: "2026-06-02",
    occurred_at_time: "12:00",
    counterparty: "Invented payee",
    category_id: null,
    note: null,
    captured_at: "2026-06-02T05:00:00Z",
    ...overrides
  });

  it("keeps slips out of the balance derivation entirely", () => {
    // `combinedBalanceByTransaction` takes confirmed rows only — there is no overload that
    // accepts a slip, which is the type system carrying the invariant rather than a comment.
    const rows: AccountTransaction[] = [{ ...transaction(), account_id: "acct-1" }];
    const balances = combinedBalanceByTransaction(rows);
    expect(balances.size).toBe(1);
    expect(balances.get(transaction().id)).toBe("100000");
  });

  it("filters a slip by reference, counterparty, note and bank, and not by its id", () => {
    expect(matchesSlipQuery(slip(), "inventedref")).toBe(true);
    expect(matchesSlipQuery(slip(), "payee")).toBe(true);
    expect(matchesSlipQuery(slip({ note: "Invented note" }), "invented note")).toBe(true);
    expect(matchesSlipQuery(slip(), "scb")).toBe(true);
    expect(matchesSlipQuery(slip(), "")).toBe(true);
    expect(matchesSlipQuery(slip(), "33333333-3333-4333-8333-333333333333")).toBe(false);
  });

  it("tolerates a slip with no counterparty or note, which is the common case", () => {
    expect(matchesSlipQuery(slip({ counterparty: null, note: null }), "anything")).toBe(false);
    expect(matchesSlipQuery(slip({ counterparty: null, note: null }), "")).toBe(true);
  });

  it("accepts the shape GET /api/v1/slips returns, and rejects an unknown column", () => {
    expect(slipListSchema.safeParse({ slips: [slip()], matches: [] }).success).toBe(true);
    // Strict, so a migration adding a column fails here loudly rather than being ignored.
    expect(slipListSchema.safeParse({ slips: [{ ...slip(), reconciled_transaction_id: null }], matches: [] }).success).toBe(false);
    // Money must arrive as canonical text; a JSON number is the one way a float could enter.
    expect(slipListSchema.safeParse({ slips: [{ ...slip(), amount_minor: -25000 }], matches: [] }).success).toBe(false);
  });

  it("requires the stored decisions to arrive with the slips rather than separately", () => {
    // The two are one response on purpose (D-067): slips arriving without their decisions would
    // show a pairing the owner has already overruled and call it the rule's. A response missing
    // the key is a contract failure, not an empty list.
    expect(slipListSchema.safeParse({ slips: [] }).success).toBe(false);
    const decision = {
      slip_id: "33333333-3333-4333-8333-333333333333",
      decision: "matched",
      transaction_id: "44444444-4444-4444-8444-444444444444",
      revision: 1
    };
    expect(slipListSchema.safeParse({ slips: [slip()], matches: [decision] }).success).toBe(true);
    // `unmatched` carries no row, and a vocabulary this schema does not know is not a decision.
    expect(slipListSchema.safeParse({ slips: [], matches: [{ ...decision, decision: "unmatched", transaction_id: null }] }).success).toBe(true);
    expect(slipListSchema.safeParse({ slips: [], matches: [{ ...decision, decision: "maybe" }] }).success).toBe(false);
    // The owner id and timestamp the table also holds are not part of the published shape.
    expect(slipListSchema.safeParse({ slips: [], matches: [{ ...decision, owner_id: "x" }] }).success).toBe(false);
  });
});
