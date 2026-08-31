import { describe, expect, it } from "vitest";
import {
  compareTransactions,
  cursorAfter,
  ledgerPageSearch,
  matchesCashQuery,
  matchesQuery,
  matchesSlipQuery,
  movementMinor,
  overlayInForce,
  overlayWriteBody,
  overlayWriteBodySchema,
  overlayWriteResponseSchema,
  summarize,
  ledgerPageSchema,
  type LedgerCursor,
  type LedgerTransaction
} from "@/lib/transactions";
import { slipListSchema, type CapturedSlip } from "@/lib/slips";
import { cashListSchema, type CashEntry } from "@/lib/cash";

// The wire shape is a page object since migration 021, so the contract assertions parse one.
// `hasMore` and `totals` are constant here — what these tests are about is the row.
//
// `combined_balance_minor` is filled in per row unless the case supplies its own: it arrives on
// every page row since migration 022 and is required by the schema, so a fixture omitting it would
// fail every assertion for a reason that has nothing to do with what the assertion is about.
function page(rows: unknown[]) {
  const filled = rows.map((row) =>
    typeof row === "object" && row !== null && !("combined_balance_minor" in row)
      ? { ...row, combined_balance_minor: "100000" }
      : row);
  return { rows: filled, hasMore: false, totals: { rows: filled.length, deposits: "0", withdrawals: "0", net: "0" } };
}

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
    source_components: [{ id: "22222222-2222-4222-8222-222222222222", kind: "deposit", amount_minor: "100000", currency: "THB" }],
    transaction_overlays: [],
    ...overrides
  };
}

/**
 * The query string one ledger page request carries (migration 024, PLAN task 47).
 *
 * `app/transactions-view.tsx` builds this on both the first page of every account and every
 * deeper one `loadMore` fetches, and the two used to be built separately — the defect this
 * function exists to make impossible is a deeper page that forgets the window its first page was
 * bounded by.
 */
describe("the query string for a ledger page request", () => {
  it("carries neither part when both are absent", () => {
    expect(ledgerPageSearch({ from: null, to: null }, null)).toBe("");
  });

  it("carries the window alone, with no cursor set", () => {
    expect(ledgerPageSearch({ from: "2026-01-01", to: "2026-01-31" }, null))
      .toBe("?from=2026-01-01&to=2026-01-31");
    // An open end is omitted, on the same rule `lib/date-range.ts` uses everywhere else.
    expect(ledgerPageSearch({ from: "2026-01-01", to: null }, null)).toBe("?from=2026-01-01");
  });

  it("carries the cursor alone, beforeTime omitted when the row it points at has none", () => {
    const cursor: LedgerCursor = { beforeDate: "2026-01-15", beforeTime: null, beforeId: "11111111-1111-4111-8111-111111111111" };
    expect(ledgerPageSearch({ from: null, to: null }, cursor))
      .toBe("?beforeDate=2026-01-15&beforeId=11111111-1111-4111-8111-111111111111");
  });

  it("carries both, the window first and the cursor after it", () => {
    const cursor: LedgerCursor = { beforeDate: "2026-01-15", beforeTime: "10:00:00", beforeId: "11111111-1111-4111-8111-111111111111" };
    expect(ledgerPageSearch({ from: "2026-01-01", to: "2026-01-31" }, cursor))
      .toBe("?from=2026-01-01&to=2026-01-31&beforeDate=2026-01-15&beforeId=11111111-1111-4111-8111-111111111111&beforeTime=10%3A00%3A00");
  });

  it("reads the cursor off the last row of a page, or null when the page was empty", () => {
    expect(cursorAfter([])).toBeNull();
    const rows = [transaction({ id: "11111111-1111-4111-8111-111111111111", source_date: "2026-01-01" }),
      transaction({ id: "22222222-2222-4222-8222-222222222222", source_date: "2026-01-02", source_time: "08:00:00" })];
    expect(cursorAfter(rows)).toEqual({ beforeDate: "2026-01-02", beforeTime: "08:00:00", beforeId: "22222222-2222-4222-8222-222222222222" });
  });
});

describe("transaction wire contract", () => {
  it("accepts the shape list_account_transactions returns", () => {
    const parsed = ledgerPageSchema.safeParse(page([transaction()]));
    expect(parsed.success).toBe(true);
  });

  // The RPC casts every bigint with ::text precisely so money never becomes a JSON
  // number. A schema that accepted a decimal or a float would silently undo that.
  it.each(["1000.50", "1e5", "+1000", "-0", "01"])("rejects non-canonical money %s", (value) => {
    const parsed = ledgerPageSchema.safeParse(page([transaction({ post_balance_minor: value })]));
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown column rather than ignoring it", () => {
    const parsed = ledgerPageSchema.safeParse(page([{ ...transaction(), settled_at: "2026-06-01" }]));
    expect(parsed.success).toBe(false);
  });

  /**
   * The trim, asserted from the side that would notice it coming back.
   *
   * Nothing read `import_batch_rows`: it was 241 of 848 bytes on a row carrying the field shape
   * the parsers write, 28.4% of a payload the ledger fetches on arrival rather than on a press.
   * The route deleted the key by hand while changing the RPC still needed a migration; **migration
   * 021 is that migration**, so the database has stopped assembling it and the route trims nothing.
   *
   * This is what keeps it gone. If a later migration puts it back, the ledger view stops parsing
   * and says so by name rather than quietly paying for provenance it does not display.
   */
  it("rejects the batch provenance migration 021 dropped", () => {
    const parsed = ledgerPageSchema.safeParse(page([{
        ...transaction(),
        import_batch_rows: [{
          batch_id: "55555555-5555-4555-8555-555555555555",
          source_index: 0,
          page: 1,
          row_number: 1,
          parser_fields: { contractVersion: "krungthai-layout-v1" },
          linked_existing: false
        }]
      }]));
    expect(parsed.success).toBe(false);
  });

  /**
   * The same trim, for the fingerprint, asserted from the same side.
   *
   * 64 hex characters on every row and the ledger view has never read one — no component, no
   * total, and not reconciliation, which matches on bank, exact amount and date window. That is
   * about 80 of the ~584 bytes a row costs once the batch provenance is gone, a further ~14%.
   *
   * As with the batch provenance above, the RPC stopped building it in migration 021 and this is
   * what keeps it gone. **It asserts nothing about the column**, which keeps every job it had:
   * `unique (owner_id, account_id, fingerprint)` is what makes a re-imported statement
   * idempotent, `confirm_import` still rejects a row whose claimed fingerprint does not
   * recompute, and `export_backup_snapshot` still emits it. What this pins is only that the
   * value stops travelling to a screen that never displays it.
   */
  it("rejects the fingerprint migration 021 dropped", () => {
    const parsed = ledgerPageSchema.safeParse(page([{ ...transaction(), fingerprint: "a".repeat(64) }]));
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

/*
 * The combined-balance suite lived here until 2026-08-27 and moved to `supabase/tests/010_combined_balance.sql`
 * with the derivation itself (migration 022). It is not lost coverage: the same cases — an account
 * seeded from its own opening, the figure being independent of the order rows arrive in, a gap in
 * the balance chain, and an account with no rows contributing nothing — are asserted against the
 * implementation that now runs, in the language it runs in. Keeping a TypeScript copy as well would
 * be two answers to one question about money.
 */

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

  // An id is a server-side identity, not something a person searches by, and matching it
  // would let a filter surface rows by an internal value.
  it("does not match on the id", () => {
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

  // The uncorrected overlay — every correctable field null — because that is the row the
  // database writes when the owner corrects only a note, and the common shape on the wire.
  const correction = (overrides: Record<string, unknown> = {}) => ({
    slip_id: "33333333-3333-4333-8333-333333333333",
    kind: null,
    amount_minor: null,
    occurred_on: null,
    occurred_at_time: null,
    counterparty: null,
    category_id: null,
    note: null,
    revision: 1,
    updated_at: "2026-06-03T05:00:00Z",
    ...overrides
  });

  const cash = (overrides: Partial<CashEntry> = {}): CashEntry => ({
    id: "55555555-5555-4555-8555-555555555555",
    kind: "withdrawal",
    amount_minor: "-2500",
    currency: "THB",
    occurred_on: "2026-06-02",
    occurred_at_time: "12:15",
    counterparty: "Invented market stall",
    category_id: null,
    note: null,
    created_at: "2026-06-02T05:15:00Z",
    ...overrides
  });

  const cashCorrection = (overrides: Record<string, unknown> = {}) => ({
    cash_entry_id: "55555555-5555-4555-8555-555555555555",
    kind: null,
    amount_minor: null,
    occurred_on: null,
    occurred_at_time: null,
    counterparty: null,
    category_id: null,
    note: null,
    revision: 1,
    updated_at: "2026-06-03T05:00:00Z",
    ...overrides
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
    expect(slipListSchema.safeParse({ slips: [slip()], matches: [], corrections: [] }).success).toBe(true);
    // Strict, so a migration adding a column fails here loudly rather than being ignored.
    expect(slipListSchema.safeParse({ slips: [{ ...slip(), reconciled_transaction_id: null }], matches: [], corrections: [] }).success).toBe(false);
    // Money must arrive as canonical text; a JSON number is the one way a float could enter.
    expect(slipListSchema.safeParse({ slips: [{ ...slip(), amount_minor: -25000 }], matches: [], corrections: [] }).success).toBe(false);
  });

  it("requires the stored decisions to arrive with the slips rather than separately", () => {
    // The two are one response on purpose (D-067): slips arriving without their decisions would
    // show a pairing the owner has already overruled and call it the rule's. A response missing
    // the key is a contract failure, not an empty list.
    expect(slipListSchema.safeParse({ slips: [], corrections: [] }).success).toBe(false);
    const decision = {
      slip_id: "33333333-3333-4333-8333-333333333333",
      decision: "matched",
      transaction_id: "44444444-4444-4444-8444-444444444444",
      revision: 1
    };
    expect(slipListSchema.safeParse({ slips: [slip()], matches: [decision], corrections: [] }).success).toBe(true);
    // `unmatched` carries no row, and a vocabulary this schema does not know is not a decision.
    expect(slipListSchema.safeParse({ slips: [], matches: [{ ...decision, decision: "unmatched", transaction_id: null }], corrections: [] }).success).toBe(true);
    expect(slipListSchema.safeParse({ slips: [], matches: [{ ...decision, decision: "maybe" }], corrections: [] }).success).toBe(false);
    // The owner id and timestamp the table also holds are not part of the published shape.
    expect(slipListSchema.safeParse({ slips: [], matches: [{ ...decision, owner_id: "x" }], corrections: [] }).success).toBe(false);
  });

  it("requires the corrections to arrive with the slips too, for a sharper reason", () => {
    // A slip whose correction went missing shows the figure the owner replaced, and the ledger
    // would reconcile and total on it — the read-side twin of what migration 014 fixed.
    expect(slipListSchema.safeParse({ slips: [slip()], matches: [] }).success).toBe(false);
    expect(slipListSchema.safeParse({ slips: [slip()], matches: [], corrections: [correction()] }).success).toBe(true);
  });

  it("holds a correction to the same coupling the database does", () => {
    // Both CHECKs migration 013 puts on the overlay. A row violating either would put a
    // withdrawal on screen as a positive number and into a total in the wrong direction.
    expect(slipListSchema.safeParse({ slips: [], matches: [], corrections: [correction({ kind: "deposit", amount_minor: null })] }).success).toBe(false);
    expect(slipListSchema.safeParse({ slips: [], matches: [], corrections: [correction({ kind: null, amount_minor: "-2500" })] }).success).toBe(false);
    expect(slipListSchema.safeParse({ slips: [], matches: [], corrections: [correction({ kind: "deposit", amount_minor: "-2500" })] }).success).toBe(false);
    expect(slipListSchema.safeParse({ slips: [], matches: [], corrections: [correction({ kind: "withdrawal", amount_minor: "2500" })] }).success).toBe(false);
    // Money as a JSON number, the one way a float could enter, is refused on a correction too.
    expect(slipListSchema.safeParse({ slips: [], matches: [], corrections: [correction({ kind: "withdrawal", amount_minor: -2500 })] }).success).toBe(false);
    // And the uncorrected case, which is the common one: nulls all the way down.
    expect(slipListSchema.safeParse({ slips: [], matches: [], corrections: [correction()] }).success).toBe(true);
  });

  it("accepts the shape GET /api/v1/cash returns, and rejects an unknown column", () => {
    expect(cashListSchema.safeParse({ entries: [cash()], corrections: [] }).success).toBe(true);
    expect(cashListSchema.safeParse({ entries: [{ ...cash(), account_id: null }], corrections: [] }).success).toBe(false);
    expect(cashListSchema.safeParse({ entries: [{ ...cash(), amount_minor: -2500 }], corrections: [] }).success).toBe(false);
    // Entries and their corrections are one response, for the reason slips and decisions are.
    expect(cashListSchema.safeParse({ entries: [cash()] }).success).toBe(false);
    expect(cashListSchema.safeParse({ entries: [], corrections: [{ ...cashCorrection(), owner_id: "x" }] }).success).toBe(false);
    expect(cashListSchema.safeParse({ entries: [], corrections: [cashCorrection({ kind: "deposit", amount_minor: "-2500" })] }).success).toBe(false);
  });

  it("searches a cash entry by the only text it has", () => {
    expect(matchesCashQuery(cash(), "market")).toBe(true);
    expect(matchesCashQuery(cash({ note: "Invented note" }), "note")).toBe(true);
    expect(matchesCashQuery(cash(), "")).toBe(true);
    expect(matchesCashQuery(cash({ counterparty: null, note: null }), "anything")).toBe(false);
    // Not the id, and not the currency: neither is something a person recognises a row by.
    expect(matchesCashQuery(cash(), cash().id)).toBe(false);
  });
});

/**
 * PLAN task 48 — the overlay write body.
 *
 * **The hazard these are about is not a refusal, it is a silent success.** `PUT
 * /api/v1/transactions/[id]/overlay` takes the whole overlay and `update_transaction_overlay`
 * writes it with `on conflict do update set` over every column. A control sending only the flag is
 * refused by a `.strict()` schema and is therefore safe. A control sending the rest as `null` is
 * **accepted**, and erases the description, counterparty, effective date, category and note the
 * owner typed on a row he was only trying to mark.
 *
 * So the case that matters is a *populated* overlay surviving a toggle. A case proving the flag
 * changed would pass against the erasing implementation.
 */
describe("overlay write body", () => {
  // Every field populated with something distinguishable, which is the whole point: a body that
  // dropped one of them has to fail by naming that field rather than by failing to flip a boolean.
  const populated = transaction({
    transaction_overlays: [{
      category_id: "33333333-3333-4333-8333-333333333333",
      description: "Invented description the owner typed",
      counterparty: "Invented counterparty",
      effective_date: "2026-06-02",
      note: "Invented note",
      include_in_reporting: true,
      revision: 4,
      updated_at: "2026-06-02T03:00:00Z"
    }]
  });

  it("preserves a populated overlay when only the reporting flag is toggled", () => {
    const body = overlayWriteBody(populated, { includeInReporting: false });
    expect(body).toEqual({
      expectedRevision: 4,
      description: "Invented description the owner typed",
      counterparty: "Invented counterparty",
      effectiveDate: "2026-06-02",
      categoryId: "33333333-3333-4333-8333-333333333333",
      note: "Invented note",
      includeInReporting: false
    });
  });

  // The assertion above compares against a literal, which proves the values. This proves the
  // *shape* against the contract the route actually enforces — `.strict()`, so a missing key and
  // an extra key are both refusals and neither is visible in a value comparison.
  it("produces exactly what the route accepts", () => {
    const parsed = overlayWriteBodySchema.safeParse(overlayWriteBody(populated, { includeInReporting: false }));
    expect(parsed.success).toBe(true);
  });

  // The erasing implementation, written out so the test above is known to reject it rather than
  // assumed to. This is the body a control would send if it built the object from the flag alone.
  it("rejects the erasing body the route would otherwise accept", () => {
    const erasing = {
      expectedRevision: 4,
      description: null,
      counterparty: null,
      effectiveDate: null,
      categoryId: null,
      note: null,
      includeInReporting: false
    };
    // The route cannot tell this apart from a legitimate clear-everything write — it parses.
    expect(overlayWriteBodySchema.safeParse(erasing).success).toBe(true);
    // Which is exactly why the builder is the guard, and why it does not produce this.
    expect(overlayWriteBody(populated, { includeInReporting: false })).not.toEqual(erasing);
  });

  // A row with no overlay row at all. `revision` 0 is what the RPC's optimistic concurrency reads
  // as "I believe none exists"; every other field is null and the flag defaults true, matching the
  // column default and every `coalesce(o.include_in_reporting, true)` in migration 023.
  it("sends revision 0 and the column defaults for a row that has no overlay", () => {
    expect(overlayInForce(transaction())).toEqual({
      description: null,
      counterparty: null,
      effectiveDate: null,
      categoryId: null,
      note: null,
      includeInReporting: true,
      revision: 0
    });
    expect(overlayWriteBody(transaction(), { includeInReporting: false })).toEqual({
      expectedRevision: 0,
      description: null,
      counterparty: null,
      effectiveDate: null,
      categoryId: null,
      note: null,
      includeInReporting: false
    });
  });

  // `revision` is the database's and must never be a field a caller can name: a client that
  // thought it knew the next revision would defeat the concurrency check it exists to feed.
  it("never carries revision or updated_at as writable fields", () => {
    const body: Record<string, unknown> = overlayWriteBody(populated, { includeInReporting: false });
    expect("revision" in body).toBe(false);
    expect("updated_at" in body).toBe(false);
  });

  // The generalisation, and the reason the builder takes a `Partial` rather than a boolean: the
  // next control to change one field gets the same guarantee without re-deriving it.
  it("preserves the rest for a change to any other single field", () => {
    const body = overlayWriteBody(populated, { counterparty: "Invented replacement" });
    expect(body.counterparty).toBe("Invented replacement");
    expect(body.description).toBe("Invented description the owner typed");
    expect(body.note).toBe("Invented note");
    expect(body.includeInReporting).toBe(true);
  });
});

/**
 * The response contract. The RPC returns `to_jsonb(o)`, which carries `owner_id` and
 * `transaction_id`; the route strips both so the object is the one the ledger already parses on a
 * row and can be folded straight back into the window. `.strict()` is what holds that.
 */
describe("overlay write response", () => {
  const stored = {
    category_id: null,
    description: null,
    counterparty: null,
    effective_date: null,
    note: null,
    include_in_reporting: false,
    revision: 1,
    updated_at: "2026-06-02T03:00:00Z"
  };

  it("accepts the stripped overlay the route returns", () => {
    expect(overlayWriteResponseSchema.safeParse({ overlay: stored }).success).toBe(true);
  });

  it("rejects the unstripped row, so a route that stopped stripping fails by name", () => {
    expect(overlayWriteResponseSchema.safeParse({
      overlay: { ...stored, owner_id: "44444444-4444-4444-8444-444444444444" }
    }).success).toBe(false);
    expect(overlayWriteResponseSchema.safeParse({
      overlay: { ...stored, transaction_id: "11111111-1111-4111-8111-111111111111" }
    }).success).toBe(false);
  });
});
