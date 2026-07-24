import { describe, expect, it } from "vitest";
import { extractStatement } from "@/lib/krungthai-layout";
import { sourceRowCandidateSchema } from "@/lib/statement";
import { reconcileRows } from "@/lib/reconcile";
import { buildPage, validStatement } from "./fixtures/krungthai-layout-v1";

// Geometry reading for krungthai-layout-v1. The fixtures are invented
// (docs/FIXTURE_POLICY.md), so these prove the extractor is correct against the
// synthetic layout — not that a real Krungthai PDF matches it.

const onePage = (rows: Parameters<typeof buildPage>[0], options?: Parameters<typeof buildPage>[1]) =>
  extractStatement([buildPage(rows, options)]);

describe("krungthai frame extraction", () => {
  it("reads the statement frame from page one", () => {
    const result = extractStatement(validStatement);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;

    expect(result.frame).toEqual({
      bankCode: "KTB",
      accountType: "บัญชีออมทรัพย์",
      accountLastFour: "7890",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      openingBalance: "1000000",
      closingBalance: "1025970",
      currency: "THB"
    });
  });

  it("keeps only the last four account digits", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    // The full printed number must not survive extraction anywhere in the frame.
    expect(JSON.stringify(result.frame)).not.toContain("123");
    expect(result.frame.accountLastFour).toHaveLength(4);
  });

  it("anchors two-digit row years on the period end, not the current year", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    for (const row of result.rows) {
      expect(row.sourceDate.startsWith("2026-")).toBe(true);
    }
  });
});

describe("krungthai layout extraction", () => {
  it("reads every row from a well-formed two-page statement", () => {
    const result = extractStatement(validStatement);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;

    expect(result.rows).toHaveLength(4);
    expect(result.rows.map((row) => row.sourceDate)).toEqual([
      "2026-01-02", "2026-01-05", "2026-01-09", "2026-01-31"
    ]);
    // Provenance restarts per page, as the contract requires.
    expect(result.rows.map((row) => `${row.provenance.page}:${row.provenance.row}`))
      .toEqual(["1:1", "1:2", "1:3", "2:1"]);
  });

  it("produces rows that satisfy the import schema", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    for (const row of result.rows) {
      const parsed = sourceRowCandidateSchema.safeParse(row);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it("signs withdrawals negative and keeps deposits positive", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    expect(result.rows[0]!.components).toEqual([{ kind: "deposit", amount: { minor: "100000", currency: "THB" } }]);
    expect(result.rows[1]!.components).toEqual([{ kind: "withdrawal", amount: { minor: "-25050", currency: "THB" } }]);
  });

  it("attaches a wrapped detail line to the row above it", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    expect(result.rows[0]!.transactionLabel).toBe("โอนเงินเข้า");
    expect(result.rows[0]!.description).toBe("Synthetic inbound transfer");
    // A row printed without a detail line falls back to its label.
    expect(result.rows[2]!.description).toBe("ถอนเงินสด");
  });

  it("reads the recognized interest/tax compound row as two components", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    const compound = result.rows[3]!;
    expect(compound.components).toHaveLength(2);
    expect(compound.components.map((component) => component.kind).sort()).toEqual(["deposit", "withdrawal"]);
    expect(compound.sourceTime).toBe("23:59");
  });

  it("reconciles the extracted rows from the extracted opening balance", () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    const reconciliation = reconcileRows(result.frame.openingBalance, result.rows);
    expect(reconciliation.blockers).toHaveLength(0);
  });
});

describe("krungthai frame fails closed", () => {
  const rows = [{ date: "02/01/69", label: "x", deposit: "1.00", balance: "10,259.70" }];

  it.each([
    ["account type", { accountType: null }],
    ["account number", { accountNumber: null }],
    ["statement period", { period: null }],
    ["opening balance", { opening: null }],
    ["closing balance", { closing: null }]
  ])("rejects a frame with no %s", (_field, frame) => {
    expect(onePage(rows, { frame })).toMatchObject({ ok: false, code: "MISSING_FRAME_FIELD" });
  });

  it("rejects a statement that does not state THB", () => {
    expect(onePage(rows, { frame: { currencyMarker: null } }))
      .toMatchObject({ ok: false, code: "UNSUPPORTED_CURRENCY" });
  });

  it("rejects an unreadable statement period", () => {
    expect(onePage(rows, { frame: { period: "01/01/69" } }))
      .toMatchObject({ ok: false, code: "INVALID_FRAME_CONTENT" });
  });

  it("rejects an inverted statement period", () => {
    expect(onePage(rows, { frame: { period: "31/01/69 - 01/01/69" } }))
      .toMatchObject({ ok: false, code: "INVALID_FRAME_CONTENT" });
  });

  it("rejects an unparsable opening balance", () => {
    expect(onePage(rows, { frame: { opening: "1.0e4" } }))
      .toMatchObject({ ok: false, code: "INVALID_FRAME_CONTENT" });
  });

  it("rejects a closing balance that disagrees with the final row", () => {
    expect(onePage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "10,000.01" }]))
      .toMatchObject({ ok: false, code: "CLOSING_BALANCE_MISMATCH" });
  });
});

describe("krungthai layout fails closed", () => {
  it("rejects a document without the bank signature", () => {
    expect(onePage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "2.00" }], { withSignature: false }))
      .toMatchObject({ ok: false, code: "UNSUPPORTED_LAYOUT" });
  });

  it("rejects a page missing a column heading", () => {
    expect(onePage([{ date: "02/01/69", label: "x", deposit: "1.00", balance: "2.00" }], { headings: false }))
      .toMatchObject({ ok: false, code: "MISSING_COLUMN_ANCHOR" });
  });

  it("rejects an impossible calendar date", () => {
    expect(onePage([{ date: "31/02/69", label: "x", deposit: "1.00", balance: "2.00" }]))
      .toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });

  it("rejects a row with no amount in either money column", () => {
    expect(onePage([{ date: "02/01/69", label: "x", balance: "2.00" }]))
      .toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });

  it("rejects money text that is not plain decimal", () => {
    expect(onePage([{ date: "02/01/69", label: "x", deposit: "1.0e3", balance: "2.00" }]))
      .toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });

  it("rejects an unknown compound row that is not the interest/tax pairing", () => {
    expect(onePage([
      { date: "02/01/69", label: "โอนเงิน", detail: "Unknown pairing", deposit: "10.00", withdrawal: "3.00", balance: "9.00" }
    ])).toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });

  it("rejects an unreadable printed time", () => {
    expect(onePage([{ date: "02/01/69", time: "25:99", label: "x", deposit: "1.00", balance: "2.00" }]))
      .toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });

  it("rejects a statement with no readable rows", () => {
    expect(onePage([])).toMatchObject({ ok: false, code: "INVALID_ROW_CONTENT" });
  });
});
